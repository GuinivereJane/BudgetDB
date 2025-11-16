from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Iterable, List, Optional

import pdfplumber

DATE_PATTERNS = [
    "%Y-%m-%d",
    "%d-%b-%Y",
    "%d %b %Y",
    "%b %d %Y",
    "%Y/%m/%d",
]


@dataclass
class TransactionRecord:
    txn_date: Optional[date]
    description: str
    amount: float
    balance: Optional[float] = None


@dataclass
class StatementData:
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    currency: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    raw_text: str = ""
    transactions: List[TransactionRecord] = field(default_factory=list)


class RBCStatementParser:
    """Attempts to parse common RBC PDF statements."""

    amount_regex = re.compile(r"([-+]?\$?\s?\d+[\d,]*\.?\d*)")
    date_regex = re.compile(r"(\d{4}-\d{2}-\d{2}|\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4})")

    def parse(self, file_data: bytes | io.BytesIO) -> StatementData:
        buffer = io.BytesIO(file_data) if isinstance(file_data, (bytes, bytearray)) else file_data
        buffer.seek(0)
        with pdfplumber.open(buffer) as pdf:
            raw_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            tables = [table for page in pdf.pages for table in page.extract_tables() or []]

        statement = StatementData(raw_text=raw_text)
        self._populate_metadata(statement, raw_text)
        statement.transactions.extend(self._parse_tables(tables))
        if not statement.transactions:
            statement.transactions.extend(self._parse_from_text(raw_text.splitlines()))
        return statement

    def _populate_metadata(self, statement: StatementData, raw_text: str) -> None:
        account_number = self._search(r"Account\s+number\s*:?\s*(\S+)", raw_text)
        period = self._search(r"Statement\s+Period\s*:?\s*(.+)", raw_text)
        currency = self._search(r"Currency\s*:?\s*([A-Z]{3})", raw_text)
        account_name = self._search(r"Account\s+Name\s*:?\s*(.+)", raw_text)

        statement.account_number = account_number
        statement.currency = currency
        statement.account_name = account_name

        if period:
            dates = re.findall(r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{4}-\d{2}-\d{2})", period)
            if len(dates) >= 2:
                statement.period_start = self._coerce_date(dates[0])
                statement.period_end = self._coerce_date(dates[1])

    def _parse_tables(self, tables: Iterable[List[List[str]]]) -> List[TransactionRecord]:
        transactions: List[TransactionRecord] = []
        for table in tables:
            for row in table:
                if not row or len(row) < 3:
                    continue
                row = [cell.strip() if isinstance(cell, str) else cell for cell in row]
                maybe_date = row[0]
                txn_date = self._coerce_date(maybe_date)
                if not txn_date and not re.match(self.date_regex, maybe_date or ""):
                    continue
                description = row[1] or ""
                withdrawal = self._clean_amount(row[2]) if len(row) > 2 else 0.0
                deposit = self._clean_amount(row[3]) if len(row) > 3 else 0.0
                balance = self._clean_amount(row[4]) if len(row) > 4 else None
                amount = deposit - withdrawal if deposit or withdrawal else self._clean_amount(row[-2])
                transactions.append(
                    TransactionRecord(
                        txn_date=txn_date,
                        description=description,
                        amount=amount,
                        balance=balance,
                    )
                )
        return transactions

    def _parse_from_text(self, lines: Iterable[str]) -> List[TransactionRecord]:
        transactions: List[TransactionRecord] = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            date_match = re.match(self.date_regex, line)
            if not date_match:
                continue
            txn_date = self._coerce_date(date_match.group(0))
            parts = line[date_match.end() :].strip()
            amount_matches = list(self.amount_regex.finditer(parts))
            if not amount_matches:
                continue
            amount_str = amount_matches[-1].group(1)
            amount = self._clean_amount(amount_str)
            description = parts[: amount_matches[-1].start()].strip()
            transactions.append(TransactionRecord(txn_date=txn_date, description=description, amount=amount))
        return transactions

    def _search(self, pattern: str, text: str) -> Optional[str]:
        match = re.search(pattern, text, re.IGNORECASE)
        return match.group(1).strip() if match else None

    def _clean_amount(self, value: Optional[str]) -> float:
        if not value:
            return 0.0
        value = value.replace("$", "").replace(",", "").strip()
        try:
            return float(value)
        except ValueError:
            return 0.0

    def _coerce_date(self, value: Optional[str]) -> Optional[date]:
        if not value:
            return None
        value = value.strip()
        for pattern in DATE_PATTERNS:
            try:
                return datetime.strptime(value, pattern).date()
            except ValueError:
                continue
        try:
            return datetime.strptime(value, "%d-%b-%y").date()
        except ValueError:
            return None
