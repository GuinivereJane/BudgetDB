import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn
} from 'typeorm'
import { Transaction } from './Transaction'

@Entity('statements')
export class Statement {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ name: 'account_name', type: 'varchar', length: 255, nullable: true })
  account_name!: string | null

  @Column({ name: 'account_number', type: 'varchar', length: 64, nullable: true })
  account_number!: string | null

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency!: string | null

  @Column({ name: 'period_start', type: 'date', nullable: true })
  period_start!: Date | null

  @Column({ name: 'period_end', type: 'date', nullable: true })
  period_end!: Date | null

  @Column({ name: 'raw_metadata', type: 'jsonb', nullable: true })
  raw_metadata!: Record<string, unknown> | null

  @Column({ name: 'source_filename', type: 'varchar', length: 255, nullable: true })
  source_filename!: string | null

  @Column({ name: 'unique_key', type: 'varchar', length: 64, nullable: true, unique: true })
  unique_key!: string | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @OneToMany(() => Transaction, (txn) => txn.statement, { cascade: ['insert'], eager: true })
  transactions!: Transaction[]
}
