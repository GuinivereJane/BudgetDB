import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'
import './App.css'

type Transaction = {
  id: number
  txn_date: string | null
  description: string
  amount: number
  balance: number | null
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
    <form className="card" onSubmit={handleSubmit}>
      <h2>Upload a statement</h2>
      <input
        type="file"
        accept="application/pdf"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button type="submit" disabled={!file || isUploading}>
        {isUploading ? 'Uploading…' : 'Upload'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function StatementTable({ statements }: { statements: Statement[] }) {
  if (!statements.length) {
    return <p>No statements yet. Upload one to get started.</p>
  }

  return (
    <div className="card">
      <h2>Imported statements</h2>
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
    </div>
  )
}

function MonthlyBreakdown({ view }: { view: MonthlyView | null }) {
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
    <div className="card">
      <h2>
        {dayjs(`${view.year}-${String(view.month).padStart(2, '0')}-01`).format('MMMM YYYY')} summary
      </h2>
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
      {Object.entries(grouped).map(([dateKey, txns]) => (
        <div key={dateKey} className="day-block">
          <h3>{dateKey === 'Undated' ? 'Undated' : dayjs(dateKey).format('MMM D, YYYY')}</h3>
          <ul>
            {txns.map((txn) => (
              <li key={txn.id}>
                <span>{txn.description}</span>
                <span className={txn.amount >= 0 ? 'positive' : 'negative'}>
                  {txn.amount >= 0 ? '+' : '-'}${Math.abs(txn.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function App() {
  const [statements, setStatements] = useState<Statement[]>([])
  const [selectedMonth, setSelectedMonth] = useState<number>(dayjs().month() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(dayjs().year())
  const [monthlyView, setMonthlyView] = useState<MonthlyView | null>(null)

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
      <UploadForm
        onUploaded={() => {
          refreshStatements()
          fetchMonthly()
        }}
      />
      <section className="grid">
        <StatementTable statements={statements} />
        <div className="card">
          <h2>Monthly view</h2>
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
            <button onClick={fetchMonthly}>Refresh</button>
          </div>
          <MonthlyBreakdown view={monthlyView} />
        </div>
      </section>
    </div>
  )
}

export default App
