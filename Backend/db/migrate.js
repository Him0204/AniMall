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

async function ensurePhase5Tables() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS orders (
      orderid INTEGER PRIMARY KEY,
      userid INTEGER NOT NULL REFERENCES users(userid),
      currency TEXT NOT NULL DEFAULT 'HKD',
      merchant_id TEXT NOT NULL,
      digest_salt TEXT NOT NULL,
      digest TEXT NOT NULL,
      total_amount_cents INTEGER NOT NULL CHECK(total_amount_cents >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed', 'cancelled')),
      stripe_checkout_session_id TEXT UNIQUE,
      stripe_payment_intent_id TEXT,
      stripe_event_id TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      paid_at INTEGER
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS order_items (
      order_itemid INTEGER PRIMARY KEY,
      orderid INTEGER NOT NULL REFERENCES orders(orderid) ON DELETE CASCADE,
      pid INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
      line_total_cents INTEGER NOT NULL CHECK(line_total_cents >= 0)
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      webhook_eventid INTEGER PRIMARY KEY,
      provider TEXT NOT NULL,
      external_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      orderid INTEGER REFERENCES orders(orderid) ON DELETE SET NULL,
      payload TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0 CHECK(processed IN (0, 1)),
      created_at INTEGER NOT NULL,
      processed_at INTEGER
    )
  `);

  await runAsync('CREATE INDEX IF NOT EXISTS idx_orders_userid_created ON orders(userid, created_at)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_orders_checkout_session ON orders(stripe_checkout_session_id)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_order_items_orderid ON order_items(orderid)');
  await runAsync('CREATE INDEX IF NOT EXISTS idx_webhook_events_orderid ON webhook_events(orderid)');
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
    await ensurePhase5Tables();
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
