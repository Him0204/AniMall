const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'animall.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('BEGIN TRANSACTION');

  db.run('DROP TABLE IF EXISTS product_images');
  db.run('DROP TABLE IF EXISTS products');
  db.run('DROP TABLE IF EXISTS categories');
  db.run('DROP TABLE IF EXISTS users');

  db.run(`
    CREATE TABLE categories (
      catid INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE users (
      userid INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE products (
      pid INTEGER PRIMARY KEY,
      catid INTEGER NOT NULL REFERENCES categories(catid) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price REAL NOT NULL CHECK(price >= 0),
      description TEXT,
      type TEXT NOT NULL DEFAULT 'Accessories',
      image_large TEXT,
      image_thumb TEXT
    )
  `);

  db.run(`
    CREATE TABLE product_images (
      imgid INTEGER PRIMARY KEY,
      pid INTEGER NOT NULL REFERENCES products(pid) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      image_large TEXT NOT NULL,
      image_thumb TEXT NOT NULL
    )
  `);

  const now = Date.now();
  const adminHash = bcrypt.hashSync('AdminPass123!', 12);
  const userHash = bcrypt.hashSync('UserPass123!', 12);

  const insertUser = db.prepare('INSERT INTO users (email, password_hash, name, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  insertUser.run('admin@animall.local', adminHash, 'Admin', 1, now, now);
  insertUser.run('user@animall.local', userHash, 'Customer', 0, now, now);
  insertUser.finalize();

  db.run('COMMIT');
});

db.close((err) => {
  if (err) {
    console.error('Failed to initialize DB.');
    process.exit(1);
  }
  console.log(`Database initialized at ${dbPath}`);
});
