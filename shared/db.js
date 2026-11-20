const { Pool } = require('pg');

let pool = null;

function createPool(connectionString = process.env.DATABASE_URL) {
  return new Pool({ connectionString });
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

function setPool(customPool) {
  pool = customPool;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { createPool, getPool, setPool, closePool };
