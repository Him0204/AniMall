const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'animall.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
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
      image_large TEXT,
      image_thumb TEXT
    )
  `);

  db.run('INSERT INTO categories (name) VALUES (?), (?)', ['Dogs', 'Cats']);

  const stmt = db.prepare('INSERT INTO products (catid, name, price, description, image_large, image_thumb) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(1, 'Premium Dog Collar', 198, 'Comfortable and durable daily collar.', 'assets/img/img001.webp', 'assets/img/img001.webp');
  stmt.run(1, 'Durable Rope Dog Toy', 78, 'Safe chewing toy for active dogs.', 'assets/img/img006.jpg', 'assets/img/img006.jpg');
  stmt.run(2, 'Soft Cat Bed', 278, 'Cozy cat bed with washable cover.', 'assets/img/img002.jpg', 'assets/img/img002.jpg');
  stmt.run(2, 'Interactive Laser Cat Toy', 118, 'Motion-activated laser toy.', 'assets/img/img007.jpg', 'assets/img/img007.jpg');
  stmt.finalize();
});

db.close((err) => {
  if (err) {
    console.error('Failed to initialize DB.');
    process.exit(1);
  }
  console.log(`Database initialized at ${dbPath}`);
});
