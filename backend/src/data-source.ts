import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { parse } from 'pg-connection-string'
import { config } from './config'
import { Statement } from './entities/Statement'
import { Transaction } from './entities/Transaction'
import { Category } from './entities/Category'

const connectionOptions = parse(config.databaseUrl)

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: connectionOptions.host ?? 'localhost',
  port: Number(connectionOptions.port ?? 5432),
  username: connectionOptions.user ?? 'budget',
  password: connectionOptions.password ?? 'budget',
  database: connectionOptions.database ?? 'budgetdb',
  entities: [Statement, Transaction, Category],
  synchronize: true,
  logging: false
})
