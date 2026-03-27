const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'animall.sqlite');
const ADMIN_EMAIL = 'admin@animall.local';
const ADMIN_PASSWORD = 'AdminPass123!';
const USER_EMAIL = 'user@animall.local';
const USER_PASSWORD = 'UserPass123!';

const db = new sqlite3.Database(dbPath);

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function ensureUsersTable() {
  const info = await allAsync("PRAGMA table_info('users')");
  if (!info.length) {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        userid INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    return;
  }

  const cols = info.map((c) => c.name);
  const required = ['userid', 'email', 'password_hash', 'name', 'is_admin', 'created_at', 'updated_at'];
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length) {
    console.warn(`users table exists but is missing columns: ${missing.join(', ')}. Please migrate manually.`);
  }
}

async function seedUsers() {
  const now = Date.now();
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const userHash = await bcrypt.hash(USER_PASSWORD, 12);

  await runAsync('INSERT OR IGNORE INTO users (email, password_hash, name, is_admin, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)', [
    ADMIN_EMAIL,
    adminHash,
    'Admin',
    now,
    now
  ]);

  await runAsync('INSERT OR IGNORE INTO users (email, password_hash, name, is_admin, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [
    USER_EMAIL,
    userHash,
    'Customer',
    now,
    now
  ]);
}

async function main() {
  db.run('PRAGMA foreign_keys = ON');
  try {
    await runAsync('BEGIN');
    await ensureUsersTable();
    await seedUsers();
    await runAsync('COMMIT');
    console.log(`Migration completed at ${dbPath}`);
  } catch (err) {
    await runAsync('ROLLBACK').catch(() => {});
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
