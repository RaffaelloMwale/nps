import { Pool } from 'pg';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'nps_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max:      20,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 2000,
});

// Set search_path on EVERY new connection so nps schema is always found.
// Without this, views that reference nps.pensioners internally fail with
// "relation pensioners does not exist" when the session has no search_path.
pool.on('connect', (client) => {
  client.query('SET search_path TO nps, public').catch(err => {
    logger.error('Failed to set search_path on new connection:', err);
  });
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO nps, public');
    await client.query('SELECT NOW()');
    logger.info('✅ Database connection established');
  } finally {
    client.release();
  }
}

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug(`Query executed in ${duration}ms | rows: ${res.rowCount}`);
  return res;
}

export async function getClient() {
  return pool.connect();
}
