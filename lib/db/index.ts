import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

const globalForDatabase = globalThis as typeof globalThis & { databasePool?: Pool }

export const pool =
  globalForDatabase.databasePool ??
  new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.databasePool = pool
}

export const db = drizzle(pool, { schema })
