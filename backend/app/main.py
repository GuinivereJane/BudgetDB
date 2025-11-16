from datetime import date
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import engine, get_db
from .models import Base, Statement, Transaction
from .parsers.rbc_statement import RBCStatementParser
from .schemas import MonthlyView, StatementRead

settings = get_settings()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="BudgetDB")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.post("/api/statements/upload", response_model=StatementRead)
async def upload_statement(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()
    parser = RBCStatementParser()
    statement_data = parser.parse(file_bytes)

    statement = Statement(
        account_name=statement_data.account_name,
        account_number=statement_data.account_number,
        currency=statement_data.currency,
        period_start=statement_data.period_start,
        period_end=statement_data.period_end,
        raw_metadata={"raw_text_length": len(statement_data.raw_text)},
        source_filename=file.filename,
    )

    for txn in statement_data.transactions:
        statement.transactions.append(
            Transaction(
                txn_date=txn.txn_date,
                description=txn.description,
                amount=txn.amount,
                balance=txn.balance,
            )
        )

    db.add(statement)
    db.commit()
    db.refresh(statement)
    return statement


@app.get("/api/statements", response_model=List[StatementRead])
def list_statements(db: Session = Depends(get_db)):
    statements = db.execute(select(Statement).order_by(Statement.created_at.desc())).scalars().all()
    return statements


@app.get("/api/statements/monthly", response_model=MonthlyView)
def monthly_view(year: int, month: int, db: Session = Depends(get_db)):
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")

    start = date(year, month, 1)
    next_month = date(year + (month // 12), (month % 12) + 1, 1)

    transactions = (
        db.execute(
            select(Transaction).where(
                Transaction.txn_date >= start,
                Transaction.txn_date < next_month,
            ).order_by(Transaction.txn_date)
        )
        .scalars()
        .all()
    )

    inflow = sum(txn.amount for txn in transactions if txn.amount > 0)
    outflow = sum(txn.amount for txn in transactions if txn.amount < 0)
    return MonthlyView(
        month=month,
        year=year,
        total_inflow=round(inflow, 2),
        total_outflow=round(outflow, 2),
        net=round(inflow + outflow, 2),
        transactions=transactions,
    )


@app.get("/api/health")
def healthcheck():
    return {"status": "ok"}
