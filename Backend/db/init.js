const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'animall.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('DROP TABLE IF EXISTS product_images');
  db.run('DROP TABLE IF EXISTS products');
  db.run('DROP TABLE IF EXISTS categories');

  db.run(`
    CREATE TABLE categories (
      catid INTEGER PRIMARY KEY,
      name TEXT NOT NULL
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

  db.run('INSERT INTO categories (name) VALUES (?), (?)', ['Dogs', 'Cats']);

  const stmt = db.prepare('INSERT INTO products (catid, name, price, description, type, image_large, image_thumb) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(1, 'Premium Dog Collar', 198, 'Comfortable and durable daily collar.', 'Accessories', 'assets/img/img001.webp', 'assets/img/img001.webp');
  stmt.run(1, 'Durable Rope Dog Toy', 78, 'Safe chewing toy for active dogs.', 'Toys', 'assets/img/img006.jpg', 'assets/img/img006.jpg');
  stmt.run(2, 'Soft Cat Bed', 278, 'Cozy cat bed with washable cover.', 'Accessories', 'assets/img/img002.jpg', 'assets/img/img002.jpg');
  stmt.run(2, 'Interactive Laser Cat Toy', 118, 'Motion-activated laser toy.', 'Toys', 'assets/img/img007.jpg', 'assets/img/img007.jpg');
  stmt.finalize();

  // Seed primary images into product_images
  const imgStmt = db.prepare('INSERT INTO product_images (pid, sort_order, image_large, image_thumb) VALUES (?, 0, ?, ?)');
  imgStmt.run(1, 'assets/img/img001.webp', 'assets/img/img001.webp');
  imgStmt.run(2, 'assets/img/img006.jpg', 'assets/img/img006.jpg');
  imgStmt.run(3, 'assets/img/img002.jpg', 'assets/img/img002.jpg');
  imgStmt.run(4, 'assets/img/img007.jpg', 'assets/img/img007.jpg');
  imgStmt.finalize();
});

db.close((err) => {
  if (err) {
    console.error('Failed to initialize DB.');
    process.exit(1);
  }
  console.log(`Database initialized at ${dbPath}`);
});
