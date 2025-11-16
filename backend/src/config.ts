import dotenv from 'dotenv'

dotenv.config()

const DEFAULT_DATABASE_URL = 'postgres://budget:budget@db:5432/budgetdb'

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return ['http://localhost:5173']
  }
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean)
}

export const config = {
  port: Number(process.env.PORT ?? 8000),
  databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
}
