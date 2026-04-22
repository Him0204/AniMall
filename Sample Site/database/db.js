const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shop.db');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      price REAL NOT NULL CHECK(price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      image_url TEXT,
      stripe_price_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','shipped','delivered','cancelled')),
      subtotal REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      shipping_name TEXT,
      shipping_email TEXT,
      shipping_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL
    );
  `);

  const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (!admin) {
    const hash = bcrypt.hashSync('Admin@1234', 12);
    db.prepare("INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?,'admin')")
      .run('admin', 'admin@shop.com', hash);
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (count === 0) {
    const insertCategory = db.prepare('INSERT INTO categories (name,slug,description) VALUES (?,?,?)');
    const insertProduct = db.prepare('INSERT INTO products (category_id,name,slug,description,price,stock) VALUES (?,?,?,?,?,?)');

    const electronics = insertCategory.run('Electronics', 'electronics', 'Devices and gadgets').lastInsertRowid;
    const clothing = insertCategory.run('Clothing', 'clothing', 'Apparel and accessories').lastInsertRowid;
    const books = insertCategory.run('Books', 'books', 'Popular books').lastInsertRowid;

    insertProduct.run(electronics, 'Wireless Headphones', 'wireless-headphones', 'Noise-cancelling over-ear headphones.', 89.99, 30);
    insertProduct.run(electronics, 'Smart Watch', 'smart-watch', 'Fitness and notification smartwatch.', 149.99, 18);
    insertProduct.run(clothing, 'Classic T-Shirt', 'classic-t-shirt', 'Soft cotton t-shirt.', 24.99, 80);
    insertProduct.run(clothing, 'Denim Jacket', 'denim-jacket', 'Casual slim denim jacket.', 79.99, 25);
    insertProduct.run(books, 'Clean Code', 'clean-code', 'Software craftsmanship classic.', 34.99, 40);
    insertProduct.run(books, 'The Pragmatic Programmer', 'the-pragmatic-programmer', 'Modern development classic.', 44.99, 35);
  }
}

module.exports = { getDb, initializeDatabase };
