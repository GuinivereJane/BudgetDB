import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'
import './App.css'

type Category = {
  id: number
  name: string
  code: string | null
  color: string | null
}

type Transaction = {
  id: number
  txn_date: string | null
  description: string
  amount: number
  balance: number | null
  category: Category | null
}

type Statement = {
  id: number
  account_name: string | null
  account_number: string | null
  currency: string | null
  period_start: string | null
  period_end: string | null
  created_at: string
  source_filename: string | null
  transactions: Transaction[]
}

type MonthlyView = {
  month: number
  year: number
  total_inflow: number
  total_outflow: number
  net: number
  transactions: Transaction[]
  category_totals?: { name: string; color: string | null; total: number }[]
}

const API_BASE_URL = (globalThis as any).__API_BASE_URL__ ?? 'http://localhost:8000/api'

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) {
      setError('Select a PDF before uploading')
      return
    }
    setIsUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await axios.post(`${API_BASE_URL}/statements/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setFile(null)
      onUploaded()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <button type="submit" disabled={!file || isUploading}>
        {isUploading ? 'Uploading…' : 'Upload'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function StatementTable({
  statements,
  onClearAll,
  isClearing,
  onExport,
  isExporting
}: {
  statements: Statement[]
  onClearAll: () => void
  isClearing: boolean
  onExport: () => void
  isExporting: boolean
}) {
  return !statements.length ? (
    <p>No statements yet. Upload one to get started.</p>
  ) : (
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Period</th>
          <th>Transactions</th>
          <th>Imported</th>
        </tr>
      </thead>
      <tbody>
        {statements.map((statement) => (
          <tr key={statement.id}>
            <td>
              <div>{statement.account_name ?? '—'}</div>
              <small>{statement.account_number ?? 'N/A'}</small>
            </td>
            <td>
              {statement.period_start ? dayjs(statement.period_start).format('MMM D, YYYY') : 'Unknown'}
              {' – '}
              {statement.period_end ? dayjs(statement.period_end).format('MMM D, YYYY') : 'Unknown'}
            </td>
            <td>{statement.transactions.length}</td>
            <td>{dayjs(statement.created_at).format('MMM D, YYYY h:mm A')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MonthlySummary({ view }: { view: MonthlyView | null }) {
  if (!view) {
    return <p>Select a month to view its activity.</p>
  }

  return (
    <>
      <h2>{dayjs(`${view.year}-${String(view.month).padStart(2, '0')}-01`).format('MMMM YYYY')} summary</h2>
      {view.category_totals && view.category_totals.length > 0 && (
        <div className="category-summary-table-wrapper">
          <table className="category-summary-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {view.category_totals.map((category) => (
                <tr key={category.name}>
                  <td>
                    <span
                      className="category-pill"
                      style={category.color ? { backgroundColor: category.color } : undefined}
                    >
                      {category.name}
                    </span>
                  </td>
                  <td className={category.total >= 0 ? 'positive' : 'negative'}>
                    {category.total >= 0 ? '+' : '-'}${Math.abs(category.total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="stats">
        <div>
          <span>Inflow</span>
          <strong>${view.total_inflow.toFixed(2)}</strong>
        </div>
        <div>
          <span>Outflow</span>
          <strong>${Math.abs(view.total_outflow).toFixed(2)}</strong>
        </div>
        <div>
          <span>Net</span>
          <strong>${view.net.toFixed(2)}</strong>
        </div>
      </div>
    </>
  )
}

function MonthlyTransactions({ view }: { view: MonthlyView | null }) {
  if (!view) {
    return <p>Select a month to view its activity.</p>
  }

  const grouped = view.transactions.reduce<Record<string, Transaction[]>>((acc, txn) => {
    const key = txn.txn_date ?? 'Undated'
    acc[key] = acc[key] ?? []
    acc[key].push(txn)
    return acc
  }, {})

  return (
    <>
      {Object.entries(grouped).map(([dateKey, txns]) => (
        <div key={dateKey} className="day-block">
          <h3>{dateKey === 'Undated' ? 'Undated' : dayjs(dateKey).format('MMM D, YYYY')}</h3>
          <ul>
            {txns.map((txn) => (
              <li key={txn.id} className="txn-row">
                <div className="txn-info">
                  <span>{txn.description}</span>
                  {txn.category && (
                    <span
                      className="category-pill"
                      style={txn.category.color ? { backgroundColor: txn.category.color } : undefined}
                    >
                      {txn.category.name}
                    </span>
                  )}
                </div>
                <span className={txn.amount >= 0 ? 'positive' : 'negative'}>
                  {txn.amount >= 0 ? '+' : '-'}${Math.abs(txn.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

function CollapsibleSection({
  title,
  isCollapsed,
  onToggle,
  actions,
  children
}: {
  title: string
  isCollapsed: boolean
  onToggle: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        <div className="card-actions">
          {actions}
          <button type="button" className="ghost" onClick={onToggle}>
            {isCollapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>
      {!isCollapsed && <div className="card-body">{children}</div>}
    </section>
  )
}

function App() {
  const [statements, setStatements] = useState<Statement[]>([])
  const [selectedMonth, setSelectedMonth] = useState<number>(dayjs().month() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(dayjs().year())
  const [monthlyView, setMonthlyView] = useState<MonthlyView | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [collapsed, setCollapsed] = useState({
    upload: false,
    statements: false,
    monthlySummary: false,
    monthlyTransactions: false
  })

  const refreshStatements = () => {
    axios.get<Statement[]>(`${API_BASE_URL}/statements`).then((response) => {
      setStatements(response.data)
    })
  }

  const fetchMonthly = () => {
    axios
      .get<MonthlyView>(`${API_BASE_URL}/statements/monthly`, {
        params: { month: selectedMonth, year: selectedYear }
      })
      .then((response) => setMonthlyView(response.data))
      .catch(() => setMonthlyView(null))
  }

  useEffect(() => {
    refreshStatements()
  }, [])

  useEffect(() => {
    fetchMonthly()
  }, [selectedMonth, selectedYear])

  const clearAllData = () => {
    if (!statements.length) {
      return
    }
    if (!window.confirm('Are you sure you want to delete all imported statements and transactions?')) {
      return
    }
    setIsClearing(true)
    axios
      .delete(`${API_BASE_URL}/statements`)
      .then(() => {
        refreshStatements()
        fetchMonthly()
      })
      .catch((error) => {
        window.alert(error?.response?.data?.detail ?? 'Failed to clear data')
      })
      .finally(() => setIsClearing(false))
  }

  const exportTransactions = () => {
    if (isExporting) {
      return
    }
    setIsExporting(true)
    axios
      .get(`${API_BASE_URL}/transactions/export`, { responseType: 'blob' })
      .then((response) => {
        const blob = new Blob([response.data], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'transactions.csv'
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
      })
      .catch((error) => {
        window.alert(error?.response?.data?.detail ?? 'Failed to export CSV')
      })
      .finally(() => setIsExporting(false))
  }

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        label: dayjs().month(index).format('MMMM'),
        value: index + 1
      })),
    []
  )

  const uniqueYears = useMemo(() => {
    const years = new Set<number>()
    statements.forEach((statement) => {
      if (statement.period_start) {
        years.add(dayjs(statement.period_start).year())
      }
    })
    const sorted = Array.from(years).sort((a, b) => b - a)
    if (!sorted.length) {
      sorted.push(dayjs().year())
    }
    return sorted
  }, [statements])

  return (
    <div className="container">
      <header>
        <h1>BudgetDB</h1>
        <p>Parse RBC statements locally and explore your spending.</p>
      </header>
      <div className="grid">
        <CollapsibleSection
          title="Upload a statement"
          isCollapsed={collapsed.upload}
          onToggle={() => setCollapsed((prev) => ({ ...prev, upload: !prev.upload }))}
        >
          <UploadForm
            onUploaded={() => {
              refreshStatements()
              fetchMonthly()
            }}
          />
        </CollapsibleSection>
        <CollapsibleSection
          title="Imported statements"
          isCollapsed={collapsed.statements}
          onToggle={() => setCollapsed((prev) => ({ ...prev, statements: !prev.statements }))}
          actions={
            <>
              <button onClick={exportTransactions} disabled={!statements.length || isExporting}>
                {isExporting ? 'Exporting…' : 'Export CSV'}
              </button>
              {statements.length > 0 && (
                <button className="danger" onClick={clearAllData} disabled={isClearing}>
                  {isClearing ? 'Clearing…' : 'Clear data'}
                </button>
              )}
            </>
          }
        >
          <StatementTable
            statements={statements}
            onClearAll={clearAllData}
            isClearing={isClearing}
            onExport={exportTransactions}
            isExporting={isExporting}
          />
        </CollapsibleSection>
        <CollapsibleSection
          title="Monthly summary"
          isCollapsed={collapsed.monthlySummary}
          onToggle={() => setCollapsed((prev) => ({ ...prev, monthlySummary: !prev.monthlySummary }))}
          actions={<button onClick={fetchMonthly}>Refresh</button>}
        >
          <div className="controls">
            <label>
              Month
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {uniqueYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <MonthlySummary view={monthlyView} />
        </CollapsibleSection>
        <CollapsibleSection
          title="Monthly transactions"
          isCollapsed={collapsed.monthlyTransactions}
          onToggle={() => setCollapsed((prev) => ({ ...prev, monthlyTransactions: !prev.monthlyTransactions }))}
        >
          <MonthlyTransactions view={monthlyView} />
        </CollapsibleSection>
      </div>
    </div>
  )
}

export default App
