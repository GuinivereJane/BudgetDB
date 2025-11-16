import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Statement } from './Statement'
import { Category } from './Category'

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ name: 'txn_date', type: 'date', nullable: true })
  @Index()
  txn_date!: Date | null

  @Column({ type: 'text' })
  description!: string

  @Column({ type: 'float' })
  amount!: number

  @Column({ type: 'float', nullable: true })
  balance!: number | null

  @ManyToOne(() => Statement, (statement) => statement.transactions, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'statement_id' })
  statement!: Statement

  @ManyToOne(() => Category, (category) => category.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
    eager: true
  })
  @JoinColumn({ name: 'category_id' })
  category!: Category | null
}
