import pdf from 'pdf-parse'
import { parse as parseDate, isValid } from 'date-fns'

const DATE_FORMATS = ['yyyy-MM-dd', 'd-MMM-yyyy', 'd MMM yyyy', 'MMM d yyyy', 'yyyy/MM/dd', 'd-MMM-yy']

type PeriodBounds = {
  start?: Date | null
  end?: Date | null
}

export type TransactionRecord = {
  txn_date: Date | null
  description: string
  amount: number
  balance: number | null
}

export type StatementData = {
  account_name: string | null
  account_number: string | null
  currency: string | null
  period_start: Date | null
  period_end: Date | null
  raw_text: string
  transactions: TransactionRecord[]
}

export class RBCStatementParser {
  private amountRegex = /(\(?[-+]?\$?\s?\d[\d,]*\.\d{2}\)?)/g
  private dateRegex =
    /(\d{4}-\d{2}-\d{2}|\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4}|[A-Za-z]{3}\s+\d{1,2}\s+\d{4}|\d{1,2}\s+[A-Za-z]{3})/

  async parse(buffer: Buffer): Promise<StatementData> {
    const pdfResult = await pdf(buffer)
    const raw_text = pdfResult.text
    const rawLines = raw_text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length)
    const lines = rawLines.filter((line) => !this.isHeaderLine(line))

    const statement: StatementData = {
      account_name: null,
      account_number: null,
      currency: null,
      period_start: null,
      period_end: null,
      raw_text,
      transactions: []
    }

    this.populateMetadata(statement, raw_text)

    const periodBounds: PeriodBounds = { start: statement.period_start, end: statement.period_end }

    const structured = this.parseStructuredLines(lines, periodBounds)
    if (structured.length) {
      statement.transactions = structured
    } else {
      statement.transactions = this.parseLooseLines(lines, periodBounds)
    }

    return statement
  }

  private isHeaderLine(value: string): boolean {
    const normalized = value.toLowerCase()
    if (/^\d+\s+of\s+\d+/i.test(value)) {
      return true
    }
    if (/^\d+$/.test(value)) {
      return true
    }
    return (
      normalized.includes('royal bank of canada') ||
      normalized.includes('p.o. box') ||
      normalized.includes('your account number') ||
      normalized.includes('your rbc personal banking') ||
      normalized.includes('your account statement') ||
      normalized.includes('account statement from') ||
      normalized.includes('how to reach us') ||
      normalized.includes('www.rbc') ||
      normalized.includes('rbcroyalbank.com') ||
      normalized.includes('summary of your account') ||
      normalized.includes('details of your account activity') ||
      normalized.includes('datedescriptionwithdrawals') ||
      normalized.includes('important information about your account') ||
      normalized.includes('protect your pin') ||
      normalized.includes('stay informed on the latest cyber scams') ||
      normalized.includes('rbpda') ||
      normalized.includes('trademark')
    )
  }

  private populateMetadata(statement: StatementData, text: string) {
    statement.account_number = this.search(/Account\s+number\s*:?\s*(\S+)/i, text)
    statement.currency = this.search(/Currency\s*:?\s*([A-Z]{3})/i, text)
    statement.account_name = this.search(/Account\s+Name\s*:?\s*(.+)/i, text)

    const period = this.search(/Statement\s+Period\s*:?\s*(.+)/i, text)
    if (period) {
      const matches = period.match(/(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{4}-\d{2}-\d{2})/g)
      if (matches && matches.length >= 2) {
        statement.period_start = this.coerceDate(matches[0])
        statement.period_end = this.coerceDate(matches[1])
      }
    }
  }

  private parseStructuredLines(lines: string[], bounds: PeriodBounds): TransactionRecord[] {
    const transactions: TransactionRecord[] = []
    for (const line of lines) {
      const columns = line.split(/\s{2,}/).map((value) => value.trim()).filter(Boolean)
      if (columns.length < 3) {
        continue
      }

      const txn_date = this.coerceDate(columns[0], bounds)
      if (!txn_date) {
        continue
      }

      const description = columns[1]
      const numericColumns = columns
        .slice(2)
        .map((value) => ({ raw: value, amount: this.cleanAmount(value) }))
        .filter((entry) => !Number.isNaN(entry.amount))

      if (!numericColumns.length) {
        continue
      }

      let amount = numericColumns.length >= 2 ? numericColumns[numericColumns.length - 2].amount : numericColumns[0].amount
      let balance: number | null = numericColumns.length >= 2 ? numericColumns[numericColumns.length - 1].amount : null

      if (numericColumns.length >= 3) {
        const withdrawal = numericColumns[0].amount
        const deposit = numericColumns[1].amount
        if (withdrawal !== 0 || deposit !== 0) {
          amount = deposit - withdrawal
          balance = numericColumns[numericColumns.length - 1].amount
        }
      }

      transactions.push({ txn_date, description, amount, balance })
    }
    return transactions
  }

  private parseLooseLines(lines: string[], bounds: PeriodBounds): TransactionRecord[] {
    const transactions: TransactionRecord[] = []
    let currentDate: Date | null = null
    let displayParts: string[] = []

    const pushTransaction = (amountValue: number, balanceValue: number | null) => {
      if (!currentDate) {
        return
      }
      const finalDescription = displayParts.join(' ').trim()
      const sign = this.determineSign(finalDescription)
      transactions.push({
        txn_date: currentDate,
        description: finalDescription,
        amount: amountValue * sign,
        balance: balanceValue
      })
      displayParts = []
    }

    for (const rawLine of lines) {
      if (!rawLine.length) {
        continue
      }
      if (this.isHeaderLine(rawLine)) {
        continue
      }

      let line = rawLine
      let isContinuationLine = false
      const dateMatch = line.match(this.dateRegex)
      if (dateMatch && dateMatch.index === 0) {
        const derivedDate = this.coerceDate(dateMatch[0], bounds)
        if (derivedDate) {
          currentDate = derivedDate
          displayParts = []
          line = line.slice(dateMatch[0].length).trim()
          isContinuationLine = false
        } else {
          isContinuationLine = Boolean(currentDate)
        }
      } else {
        isContinuationLine = Boolean(currentDate)
      }

      if (!currentDate || !line.length) {
        continue
      }

      const normalized = this.normalizeReferenceSpacing(line)
      const displayLine = normalized.replace(this.amountRegex, '').trim()
      if (displayLine.length) {
        displayParts.push(displayLine)
      }

      const amountMatches = [...normalized.matchAll(this.amountRegex)]
      if (amountMatches.length) {
        const amountIndex = amountMatches.length >= 2 ? amountMatches.length - 2 : amountMatches.length - 1
        const amountToken = this.stripContinuationPrefix(
          amountMatches[amountIndex][0],
          currentDate,
          isContinuationLine
        )
        const amountValue = this.cleanAmount(amountToken)
        const balanceToken =
          amountMatches.length >= 2
            ? this.stripContinuationPrefix(
                amountMatches[amountMatches.length - 1][0],
                currentDate,
                isContinuationLine
              )
            : null
        const balanceValue = balanceToken ? this.cleanAmount(balanceToken) : null
        pushTransaction(amountValue, balanceValue)
      }
    }
    return transactions
  }

  private search(pattern: RegExp, text: string): string | null {
    const match = text.match(pattern)
    return match?.[1]?.trim() ?? null
  }

  private cleanAmount(value: string): number {
    const sanitized = value.replace(/[$,]/g, '').replace(/\s+/g, '')
    const normalized = sanitized.replace(/[()]/g, '')
    const sign = sanitized.includes('(') && sanitized.includes(')') ? -1 : 1
    const amount = Number(normalized)
    if (Number.isNaN(amount)) {
      return 0
    }
    return amount * sign
  }

  private coerceDate(value: string | null, bounds?: PeriodBounds): Date | null {
    if (!value) {
      return null
    }
    for (const format of DATE_FORMATS) {
      const parsed = parseDate(value.trim(), format, new Date())
      if (isValid(parsed)) {
        return parsed
      }
    }

    if (bounds) {
      const partialMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3})$/i)
      if (partialMatch) {
        const day = Number(partialMatch[1])
        const monthIndex = this.monthNameToIndex(partialMatch[2])
        if (!Number.isNaN(day) && monthIndex !== null) {
          const inferredYear = this.inferYearForPartialDate(monthIndex, day, bounds)
          if (inferredYear !== null) {
            const parsed = parseDate(`${day} ${partialMatch[2]} ${inferredYear}`, 'd MMM yyyy', new Date())
            if (isValid(parsed)) {
              return parsed
            }
          }
        }
      }
    }
    return null
  }

  private monthNameToIndex(month: string): number | null {
    const normalized = month.slice(0, 3).toLowerCase()
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const index = months.indexOf(normalized)
    return index === -1 ? null : index
  }

  private inferYearForPartialDate(monthIndex: number, day: number, bounds: PeriodBounds): number | null {
    const candidateYears: number[] = []
    if (bounds.start) {
      candidateYears.push(bounds.start.getFullYear())
    }
    if (bounds.end) {
      candidateYears.push(bounds.end.getFullYear())
    }
    if (!candidateYears.length) {
      candidateYears.push(new Date().getFullYear())
    }
    const uniqueYears = Array.from(new Set(candidateYears))
    for (const year of uniqueYears) {
      const candidate = new Date(year, monthIndex, day)
      if (bounds.start && candidate < bounds.start) {
        continue
      }
      if (bounds.end && candidate > bounds.end) {
        continue
      }
      return year
    }
    return uniqueYears[0] ?? null
  }

  private normalizeReferenceSpacing(value: string): string {
    return value
      .replace(/([A-Za-z#-])(\d[\d,]*\.\d{2})/g, '$1 $2')
      .replace(/(\s\d{2,4})(\d{1,3}\.\d{2})/g, '$1 $2')
  }

  private stripContinuationPrefix(value: string, currentDate: Date | null, isContinuationLine: boolean): string {
    if (!isContinuationLine || !currentDate) {
      return value
    }
    const trimmed = value.trim()
    const match = trimmed.match(/^(\d{1,2})(\d[\d,]*\.\d{2})$/)
    if (!match) {
      return value
    }
    const prefixDay = Number(match[1])
    if (Number.isNaN(prefixDay)) {
      return value
    }
    const currentDay = currentDate.getDate()
    if (prefixDay === currentDay) {
      return match[2]
    }
    return value
  }

  private determineSign(description: string): number {
    const normalized = description.toLowerCase()
    const negativeKeywords = [
      'withdrawal',
      'purchase',
      'payment',
      'fee',
      'transfer sent',
      'transfer to',
      'online transfer to',
      'online banking payment',
      'bill payment',
      'misc payment',
      'contactless',
      'interac',
      'insurance',
      'loan',
      'mortgage',
      'tax',
      'utility bill',
      'property tax',
      'investment',
      'to find & save',
      'monthly fee',
      'overdraft',
      'auto transfer to',
      'deposit account'
    ]
    if (negativeKeywords.some((keyword) => normalized.includes(keyword))) {
      return -1
    }

    const positiveKeywords = [
      'deposit',
      'received',
      'auto transfer from',
      'transfer from',
      'refund',
      'rebate',
      'credit',
      'interest',
      'benefit',
      'payroll',
      'online banking transfer',
      'auto transfer from find & save'
    ]
    if (positiveKeywords.some((keyword) => normalized.includes(keyword))) {
      return 1
    }

    return -1
  }
}
