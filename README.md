# BudgetDB

BudgetDB ingests RBC PDF statements locally, stores the parsed data in PostgreSQL, and exposes a React UI for uploading statements and browsing a monthly view of transactions.

## Running locally

You only need Docker installed. Start every service with:

```bash
docker-compose up --build
```

This command starts three containers:

1. **db** – PostgreSQL 15 with credentials `budget/budget` and database `budgetdb`.
2. **backend** – FastAPI application on <http://localhost:8000>. It exposes `/api/statements/upload`, `/api/statements`, `/api/statements/monthly`, and `/api/health`.
3. **frontend** – Vite + React dev server on <http://localhost:5173>. It uploads PDFs and renders imported statements plus a monthly transaction dashboard.

Stop everything with `Ctrl+C` and `docker-compose down`.

## Development notes

- Back-end dependencies live in `backend/requirements.txt`. Use `pip install -r backend/requirements.txt` inside a virtualenv when developing without Docker.
- Front-end dependencies are managed with npm. Run `npm install` under `frontend/` before `npm run dev`.
- PDF parsing uses [`pdfplumber`](https://github.com/jsvine/pdfplumber) plus heuristics that target the tabular structure of typical RBC statements. The parser stores every extracted transaction in the `transactions` table and keeps key metadata (account, currency, statement period, filename).
- **Never commit actual statement PDFs or personal information.** Keep any samples under a folder listed in `.gitignore` (e.g., `data/` or `statements/`).

## Database schema

```text
statements
├─ id (PK)
├─ account_name
├─ account_number
├─ currency
├─ period_start / period_end
├─ raw_metadata (JSON payload describing the raw text length)
├─ source_filename
└─ created_at

transactions
├─ id (PK)
├─ statement_id (FK → statements.id)
├─ txn_date
├─ description
├─ amount (positive for deposits, negative for withdrawals)
└─ balance (if available)
```

Use `psql` (or any SQL client) against `localhost:5432` with the credentials above to inspect or query records.
