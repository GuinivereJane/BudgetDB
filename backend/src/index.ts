import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createHash } from 'crypto'
import { config } from './config'
import { AppDataSource } from './data-source'
import { Statement } from './entities/Statement'
import { Transaction } from './entities/Transaction'
import { RBCStatementParser } from './parsers/rbcStatementParser'

const upload = multer({ storage: multer.memoryStorage() })
const parser = new RBCStatementParser()

const allowedMimeTypes = new Set(['application/pdf', 'application/octet-stream'])

function coerceDateValue(value: Date | string | null): Date | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeTransactionDates(transactions: Transaction[]) {
  transactions.forEach((txn) => {
    txn.txn_date = coerceDateValue(txn.txn_date)
  })
}

async function bootstrap() {
  await AppDataSource.initialize()
  const app = express()

  app.use(cors({ origin: config.allowedOrigins, credentials: true }))
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/api/statements', async (_req, res) => {
    const repo = AppDataSource.getRepository(Statement)
    const statements = await repo.find({ order: { created_at: 'DESC' } })
    statements.forEach((statement) => {
      normalizeTransactionDates(statement.transactions)
      statement.transactions.sort((a, b) => {
        if (!a.txn_date && !b.txn_date) return a.id - b.id
        if (!a.txn_date) return 1
        if (!b.txn_date) return -1
        const diff = a.txn_date.getTime() - b.txn_date.getTime()
        return diff === 0 ? a.id - b.id : diff
      })
    })
    res.json(statements)
  })

  app.get('/api/statements/monthly', async (req, res) => {
    const month = Number(req.query.month)
    const year = Number(req.query.year)

    if (!Number.isFinite(month) || !Number.isFinite(year)) {
      res.status(400).json({ detail: 'month and year are required numeric query params' })
      return
    }

    if (month < 1 || month > 12) {
      res.status(400).json({ detail: 'month must be between 1 and 12' })
      return
    }

    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1))

    const txnRepo = AppDataSource.getRepository(Transaction)
    const transactions = await txnRepo
      .createQueryBuilder('transaction')
      .where('transaction.txn_date >= :start', { start })
      .andWhere('transaction.txn_date < :end', { end })
      .orderBy('transaction.txn_date', 'ASC')
      .addOrderBy('transaction.id', 'ASC')
      .getMany()
    normalizeTransactionDates(transactions)

    const inflow = transactions.filter((txn) => txn.amount > 0).reduce((sum, txn) => sum + txn.amount, 0)
    const outflow = transactions.filter((txn) => txn.amount < 0).reduce((sum, txn) => sum + txn.amount, 0)

    res.json({
      month,
      year,
      total_inflow: Number(inflow.toFixed(2)),
      total_outflow: Number(outflow.toFixed(2)),
      net: Number((inflow + outflow).toFixed(2)),
      transactions
    })
  })

  app.post('/api/statements/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ detail: 'A PDF statement is required' })
      return
    }

    if (!allowedMimeTypes.has(req.file.mimetype)) {
      res.status(400).json({ detail: 'Only PDF uploads are supported' })
      return
    }

    const statementData = await parser.parse(req.file.buffer)

    if (!statementData.transactions.length) {
      res.status(400).json({ detail: 'Unable to parse any transactions from the provided file' })
      return
    }

    const repo = AppDataSource.getRepository(Statement)
    const txnRepo = AppDataSource.getRepository(Transaction)

    const uniqueKey = createHash('sha256').update(statementData.raw_text).digest('hex')
    const existing = await repo.findOne({ where: { unique_key: uniqueKey } })
    if (existing) {
      res.status(409).json({ detail: 'This statement has already been imported' })
      return
    }

    const statement = repo.create({
      account_name: statementData.account_name,
      account_number: statementData.account_number,
      currency: statementData.currency,
      period_start: statementData.period_start,
      period_end: statementData.period_end,
      raw_metadata: { raw_text_length: statementData.raw_text.length },
      source_filename: req.file.originalname,
      unique_key: uniqueKey,
      transactions: statementData.transactions.map((txn) =>
        txnRepo.create({
          txn_date: txn.txn_date,
          description: txn.description,
          amount: Number(txn.amount.toFixed(2)),
          balance: txn.balance
        })
      )
    })

    const saved = await repo.save(statement)
    res.json(saved)
  })

  app.delete('/api/statements', async (_req, res) => {
    try {
      await AppDataSource.query('TRUNCATE TABLE transactions, statements RESTART IDENTITY CASCADE')
      res.status(204).send()
    } catch (error) {
      console.error('Failed to clear statements', error)
      res.status(500).json({ detail: 'Failed to clear statements' })
    }
  })

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    res.status(500).json({ detail: 'Unexpected server error' })
  })

  app.listen(config.port, () => {
    console.log(`API listening on port ${config.port}`)
  })
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
