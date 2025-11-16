import { AppDataSource } from '../data-source'
import { Category } from '../entities/Category'
import { Transaction } from '../entities/Transaction'
import { TransactionRecord } from '../parsers/rbcStatementParser'

type CategorySeedConfig = {
  name: string
  code: string
  color: string
  priority: number
  rules: string[]
}

const DEFAULT_CATEGORY_CONFIG: CategorySeedConfig[] = [
  {
    name: 'Income',
    code: 'income',
    color: '#15803d',
    priority: 10,
    rules: ['online banking transfer -', 'auto transfer from', 'transfer from', 'payroll', 'deposit', 'benefit']
  },
  {
    name: 'Transfers Out',
    code: 'transfers_out',
    color: '#b91c1c',
    priority: 20,
    rules: ['online transfer sent', 'online transfer to', 'transfer to', 'auto transfer to', 'etransfer', 'to find & save']
  },
  {
    name: 'Bills & Utilities',
    code: 'bills',
    color: '#2563eb',
    priority: 30,
    rules: ['bill payment', 'insurance', 'tax', 'hydro', 'utility', 'bell', 'rogers', 'kitchener']
  },
  {
    name: 'Groceries',
    code: 'groceries',
    color: '#0f172a',
    priority: 40,
    rules: ['grocery', 'sobeys', 'central meat', 'freshco', 'no frills', 'zehrs', 'food basics', 'superstore']
  },
  {
    name: 'Dining & Coffee',
    code: 'dining',
    color: '#ea580c',
    priority: 50,
    rules: ['tim hortons', 'starbucks', 'restaurant', 'cafe', 'coffee', 'pizza', 'subway', 'burger', 'mcdonald']
  },
  {
    name: 'Shopping & Retail',
    code: 'retail',
    color: '#7c3aed',
    priority: 60,
    rules: ['shoppers', 'sephora', 'home depot', 'walmart', 'amazon', 'canadian tire', 'winners', 'costco']
  },
  {
    name: 'Transportation',
    code: 'transport',
    color: '#0891b2',
    priority: 70,
    rules: ['petro-canada', 'esso', 'shell', 'gas', 'uber', 'lyft', 'stockie chrysler', 'transit']
  },
  {
    name: 'Fees & Charges',
    code: 'fees',
    color: '#a16207',
    priority: 80,
    rules: ['fee', 'charge', 'interest', 'overdraft', 'service plan', 'nsf']
  },
  {
    name: 'Online Services',
    code: 'online_services',
    color: '#16a34a',
    priority: 90,
    rules: ['paypal', 'spotify', 'netflix', 'google', 'apple', 'microsoft', 'subscription']
  },
  {
    name: 'Uncategorized',
    code: 'uncategorized',
    color: '#6b7280',
    priority: 200,
    rules: []
  }
]

export async function ensureDefaultCategories() {
  const repo = AppDataSource.getRepository(Category)
  for (const config of DEFAULT_CATEGORY_CONFIG) {
    const normalizedRules = config.rules.map((rule) => rule.toLowerCase())
    let existing = await repo.findOne({ where: [{ code: config.code }, { name: config.name }] })
    if (!existing) {
      existing = repo.create({
        name: config.name,
        code: config.code,
        color: config.color,
        priority: config.priority,
        rules: normalizedRules
      })
    } else {
      existing.name = config.name
      existing.code = config.code
      existing.color = config.color
      existing.priority = config.priority
      existing.rules = normalizedRules
    }
    await repo.save(existing)
  }
}

export async function loadOrderedCategories(): Promise<Category[]> {
  const repo = AppDataSource.getRepository(Category)
  return repo.find({ order: { priority: 'ASC', name: 'ASC' } })
}

export function categorizeRecord(
  record: Pick<TransactionRecord, 'description' | 'amount'>,
  categories: Category[],
  fallback: Category | null,
  incomeCategory: Category | null
): Category | null {
  return categorizeByDescription(
    { description: record.description, amount: record.amount },
    categories,
    fallback,
    incomeCategory
  )
}

export function categorizeTransactionEntity(
  txn: Pick<Transaction, 'description' | 'amount'>,
  categories: Category[],
  fallback: Category | null,
  incomeCategory: Category | null
): Category | null {
  return categorizeByDescription(
    { description: txn.description, amount: txn.amount },
    categories,
    fallback,
    incomeCategory
  )
}

function categorizeByDescription(
  candidate: { description: string; amount: number },
  categories: Category[],
  fallback: Category | null,
  incomeCategory: Category | null
): Category | null {
  const normalized = (candidate.description ?? '').toLowerCase()
  for (const category of categories) {
    if (!category.rules || !category.rules.length) {
      continue
    }
    if (category.rules.some((rule) => matchesRule(rule, normalized))) {
      return category
    }
  }
  if (candidate.amount > 0 && incomeCategory) {
    return incomeCategory
  }
  return fallback
}

function matchesRule(rule: string, normalizedDescription: string): boolean {
  const trimmed = rule.trim()
  if (!trimmed) {
    return false
  }
  if (trimmed.startsWith('/') && trimmed.endsWith('/') && trimmed.length > 2) {
    try {
      const regex = new RegExp(trimmed.slice(1, -1), 'i')
      return regex.test(normalizedDescription)
    } catch {
      return false
    }
  }
  return normalizedDescription.includes(trimmed.toLowerCase())
}

export async function recategorizeExistingTransactions(): Promise<number> {
  const txnRepo = AppDataSource.getRepository(Transaction)
  const categories = await loadOrderedCategories()
  const fallback = categories.find((cat) => cat.code === 'uncategorized') ?? null
  const incomeCategory = categories.find((cat) => cat.code === 'income') ?? null
  const transactions = await txnRepo.find()
  let updated = 0
  for (const txn of transactions) {
    const nextCategory = categorizeTransactionEntity(txn, categories, fallback, incomeCategory)
    const currentId = txn.category?.id ?? null
    const nextId = nextCategory?.id ?? null
    if (currentId !== nextId) {
      txn.category = nextCategory ?? null
      await txnRepo.save(txn)
      updated++
    }
  }
  return updated
}
