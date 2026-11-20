const fs = require('fs');
const path = require('path');
const { createPool } = require('@lifelink/shared/db');
const logger = require('@lifelink/shared/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  );
}

async function appliedMigrations(pool) {
  const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
  return new Set(rows.map((row) => row.name));
}

async function applyFile(pool, file) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    logger.info(`migration applied: ${file}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  const pool = createPool(process.env.DATABASE_URL);
  try {
    await ensureMigrationsTable(pool);
    const applied = await appliedMigrations(pool);
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (!applied.has(file)) {
        await applyFile(pool, file);
      }
    }
    logger.info('database migrations up to date');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error('migration failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
