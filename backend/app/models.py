from datetime import date, datetime
from typing import Optional

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Statement(Base):
    __tablename__ = "statements"

    id = Column(Integer, primary_key=True, index=True)
    account_name = Column(String(255), nullable=True)
    account_number = Column(String(64), nullable=True, index=True)
    currency = Column(String(8), nullable=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    raw_metadata = Column(JSON, nullable=True)
    source_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="statement", cascade="all, delete-orphan")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    statement_id = Column(Integer, ForeignKey("statements.id", ondelete="CASCADE"))
    txn_date = Column(Date, nullable=True, index=True)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False)
    balance = Column(Float, nullable=True)

    statement = relationship("Statement", back_populates="transactions")
