import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { Transaction } from './Transaction'

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 128, unique: true })
  name!: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  code!: string | null

  @Column({ type: 'int', default: 0 })
  priority!: number

  @Column({ type: 'jsonb', nullable: true })
  rules!: string[] | null

  @Column({ type: 'varchar', length: 7, nullable: true })
  color!: string | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date

  @OneToMany(() => Transaction, (txn) => txn.category)
  transactions!: Transaction[]
}
