import pdf from 'pdf-parse'
import { parse as parseDate, isValid } from 'date-fns'

const DATE_FORMATS = [
  'yyyy-MM-dd',
  'd-MMM-yyyy',
  'd MMM yyyy',
  'MMM d yyyy',
  'yyyy/MM/dd',
  'd-MMM-yy'
]

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
  private amountRegex = /([-+]?\$?\s?\d[\d,]*\.?\d*)/g
  private dateRegex = /(\d{4}-\d{2}-\d{2}|\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4}|[A-Za-z]{3}\s+\d{1,2}\s+\d{4})/

  async parse(buffer: Buffer): Promise<StatementData> {
    const pdfResult = await pdf(buffer)
    const raw_text = pdfResult.text
    const lines = raw_text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length)

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

    const structured = this.parseStructuredLines(lines)
    if (structured.length) {
      statement.transactions = structured
    } else {
      statement.transactions = this.parseLooseLines(lines)
    }

    return statement
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

  private parseStructuredLines(lines: string[]): TransactionRecord[] {
    const transactions: TransactionRecord[] = []
    for (const line of lines) {
      const columns = line.split(/\s{2,}/).map((value) => value.trim()).filter(Boolean)
      if (columns.length < 3) {
        continue
      }

      const txn_date = this.coerceDate(columns[0])
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

  private parseLooseLines(lines: string[]): TransactionRecord[] {
    const transactions: TransactionRecord[] = []
    for (const line of lines) {
      const match = line.match(this.dateRegex)
      if (!match) {
        continue
      }
      const txn_date = this.coerceDate(match[0])
      if (!txn_date) {
        continue
      }
      const remainder = line.slice(match.index! + match[0].length).trim()
      const amountMatches = [...remainder.matchAll(this.amountRegex)]
      if (!amountMatches.length) {
        continue
      }
      const amountIndex = amountMatches.length >= 2 ? amountMatches.length - 2 : amountMatches.length - 1
      const amountValue = this.cleanAmount(amountMatches[amountIndex][0])
      const balance =
        amountMatches.length >= 2 ? this.cleanAmount(amountMatches[amountMatches.length - 1][0]) : null
      const descriptionEnd = amountMatches[amountIndex].index ?? remainder.length
      const description = remainder.slice(0, descriptionEnd).trim()
      transactions.push({ txn_date, description, amount: amountValue, balance })
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

  private coerceDate(value: string | null): Date | null {
    if (!value) {
      return null
    }
    for (const format of DATE_FORMATS) {
      const parsed = parseDate(value.trim(), format, new Date())
      if (isValid(parsed)) {
        return parsed
      }
    }
    return null
  }
}
