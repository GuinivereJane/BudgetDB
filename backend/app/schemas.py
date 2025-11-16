from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


class TransactionBase(BaseModel):
    txn_date: Optional[date]
    description: str
    amount: float
    balance: Optional[float]


class TransactionRead(TransactionBase):
    id: int

    class Config:
        orm_mode = True


class StatementBase(BaseModel):
    account_name: Optional[str]
    account_number: Optional[str]
    currency: Optional[str]
    period_start: Optional[date]
    period_end: Optional[date]
    raw_metadata: Optional[dict]
    source_filename: Optional[str]


class StatementRead(StatementBase):
    id: int
    created_at: datetime
    transactions: List[TransactionRead] = []

    class Config:
        orm_mode = True


class MonthlyView(BaseModel):
    month: int
    year: int
    total_inflow: float
    total_outflow: float
    net: float
    transactions: List[TransactionRead]
