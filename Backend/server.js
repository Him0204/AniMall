require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const sqlite3 = require('sqlite3').verbose();

const PORT = Number(process.env.PORT || 80);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'animall.sqlite');
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || '../Frontend/Ref/assets/uploads');
const FRONTEND_DIR = path.resolve(__dirname, '../Frontend/Ref');
const MAX_NAME_LENGTH = 120;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));

const db = new sqlite3.Database(DB_PATH);
db.run('PRAGMA foreign_keys = ON');

const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function callback(err) {
    if (err) return reject(err);
    resolve({ changes: this.changes, lastID: this.lastID });
  });
});

const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

const storage = multer.memoryStorage();
const allowedMimes = new Set(['image/jpeg', 'image/png']);
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedMimes.has(file.mimetype) || !['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Only jpg/jpeg/png files are allowed.'));
    }
    cb(null, true);
  }
});

function sanitizeName(name) {
  const value = String(name || '').trim();
  if (!value || value.length > MAX_NAME_LENGTH) return null;
  return value;
}

function sanitizePrice(price) {
  const parsed = Number(price);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

async function saveProductImages(pid, fileBuffer) {
  const base = `pid_${pid}`;
  const largeRel = `assets/uploads/${base}_large.jpg`;
  const thumbRel = `assets/uploads/${base}_thumb.jpg`;
  const largeAbs = path.join(FRONTEND_DIR, largeRel);
  const thumbAbs = path.join(FRONTEND_DIR, thumbRel);

  await sharp(fileBuffer).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(largeAbs);
  await sharp(fileBuffer).resize({ width: 300, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumbAbs);

  await runAsync('UPDATE products SET image_large = ?, image_thumb = ? WHERE pid = ?', [largeRel, thumbRel, pid]);
}

app.get('/api/categories', async (req, res) => {
  try {
    const rows = await allAsync('SELECT catid, name FROM categories ORDER BY catid');
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Unable to fetch categories.' });
  }
});

app.get('/api/products', async (req, res) => {
  const catid = Number.parseInt(req.query.catid, 10);
  if (!Number.isInteger(catid) || catid < 1) return res.status(400).json({ error: 'Invalid category.' });
  try {
    const rows = await allAsync('SELECT pid, catid, name, price, image_thumb FROM products WHERE catid = ? ORDER BY pid', [catid]);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Unable to fetch products.' });
  }
});

app.get('/api/product/:pid', async (req, res) => {
  const pid = Number.parseInt(req.params.pid, 10);
  if (!Number.isInteger(pid) || pid < 1) return res.status(400).json({ error: 'Invalid product.' });
  try {
    const row = await getAsync(
      `SELECT p.pid, p.catid, p.name, p.price, p.description, p.image_large, c.name AS category_name
       FROM products p JOIN categories c ON c.catid = p.catid WHERE p.pid = ?`,
      [pid]
    );
    if (!row) return res.status(404).json({ error: 'Product not found.' });
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Unable to fetch product.' });
  }
});

app.get('/admin', async (req, res) => {
  try {
    const [categories, products] = await Promise.all([
      allAsync('SELECT catid, name FROM categories ORDER BY catid'),
      allAsync('SELECT pid, name FROM products ORDER BY pid')
    ]);
    const message = req.query.msg ? `<p class="admin-message">${String(req.query.msg).replace(/[<>&"']/g, '')}</p>` : '';

    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin - AniMall</title><link rel="stylesheet" href="/assets/css/style.css"></head>
      <body><main class="admin-page"><h1>Admin Panel</h1>${message}<div class="admin-grid">
      <section class="admin-card"><h2>Create Category</h2><form method="post" action="/admin/categories"><label>Name <input name="name" maxlength="120" required></label><button type="submit">Create</button></form>
      <h2>Update Category</h2><form method="post" action="/admin/categories/update"><label>Category <select name="catid" required>${categories.map((c) => `<option value="${c.catid}">${c.name}</option>`).join('')}</select></label><label>New Name <input name="name" maxlength="120" required></label><button type="submit">Update</button></form>
      <h2>Delete Category</h2><form method="post" action="/admin/categories/delete"><label>Category <select name="catid" required>${categories.map((c) => `<option value="${c.catid}">${c.name}</option>`).join('')}</select></label><button type="submit">Delete</button></form></section>
      <section class="admin-card"><h2>Create Product</h2><form method="post" action="/admin/products" enctype="multipart/form-data"><label>Category <select name="catid" required>${categories.map((c) => `<option value="${c.catid}">${c.name}</option>`).join('')}</select></label><label>Name <input name="name" maxlength="120" required></label><label>Price <input name="price" type="number" min="0" step="0.01" required></label><label>Description <textarea name="description" rows="4" maxlength="1000"></textarea></label><label>Image (JPG/PNG <=10MB) <input name="image" type="file" accept=".jpg,.jpeg,.png"></label><button type="submit">Create</button></form>
      <h2>Update Product</h2><form method="post" action="/admin/products/update" enctype="multipart/form-data"><label>Product <select name="pid" required>${products.map((p) => `<option value="${p.pid}">${p.pid} - ${p.name}</option>`).join('')}</select></label><label>Category <select name="catid" required>${categories.map((c) => `<option value="${c.catid}">${c.name}</option>`).join('')}</select></label><label>Name <input name="name" maxlength="120" required></label><label>Price <input name="price" type="number" min="0" step="0.01" required></label><label>Description <textarea name="description" rows="4" maxlength="1000"></textarea></label><label>Replace Image (optional) <input name="image" type="file" accept=".jpg,.jpeg,.png"></label><button type="submit">Update</button></form>
      <h2>Delete Product</h2><form method="post" action="/admin/products/delete"><label>Product <select name="pid" required>${products.map((p) => `<option value="${p.pid}">${p.pid} - ${p.name}</option>`).join('')}</select></label><button type="submit">Delete</button></form>
      </section></div><p><a href="/">Back to Store</a></p></main></body></html>`);
  } catch {
    res.status(500).send('Admin panel unavailable.');
  }
});

app.post('/admin/categories', async (req, res) => {
  const name = sanitizeName(req.body.name);
  if (!name) return res.redirect('/admin?msg=Invalid category name');
  try {
    await runAsync('INSERT INTO categories (name) VALUES (?)', [name]);
    res.redirect('/admin?msg=Category created');
  } catch {
    res.redirect('/admin?msg=Failed to create category');
  }
});

app.post('/admin/categories/update', async (req, res) => {
  const catid = Number.parseInt(req.body.catid, 10);
  const name = sanitizeName(req.body.name);
  if (!Number.isInteger(catid) || !name) return res.redirect('/admin?msg=Invalid category update input');
  try {
    await runAsync('UPDATE categories SET name = ? WHERE catid = ?', [name, catid]);
    res.redirect('/admin?msg=Category updated');
  } catch {
    res.redirect('/admin?msg=Failed to update category');
  }
});

app.post('/admin/categories/delete', async (req, res) => {
  const catid = Number.parseInt(req.body.catid, 10);
  if (!Number.isInteger(catid)) return res.redirect('/admin?msg=Invalid category');
  try {
    await runAsync('DELETE FROM categories WHERE catid = ?', [catid]);
    res.redirect('/admin?msg=Category deleted');
  } catch {
    res.redirect('/admin?msg=Failed to delete category');
  }
});

app.post('/admin/products', upload.single('image'), async (req, res) => {
  const catid = Number.parseInt(req.body.catid, 10);
  const name = sanitizeName(req.body.name);
  const price = sanitizePrice(req.body.price);
  const description = String(req.body.description || '').trim().slice(0, 1000);
  if (!Number.isInteger(catid) || !name || price === null) return res.redirect('/admin?msg=Invalid product input');
  try {
    const result = await runAsync('INSERT INTO products (catid, name, price, description) VALUES (?, ?, ?, ?)', [catid, name, price, description]);
    if (req.file) await saveProductImages(result.lastID, req.file.buffer);
    res.redirect('/admin?msg=Product created');
  } catch {
    res.redirect('/admin?msg=Failed to create product');
  }
});

app.post('/admin/products/update', upload.single('image'), async (req, res) => {
  const pid = Number.parseInt(req.body.pid, 10);
  const catid = Number.parseInt(req.body.catid, 10);
  const name = sanitizeName(req.body.name);
  const price = sanitizePrice(req.body.price);
  const description = String(req.body.description || '').trim().slice(0, 1000);
  if (!Number.isInteger(pid) || !Number.isInteger(catid) || !name || price === null) return res.redirect('/admin?msg=Invalid product update input');
  try {
    await runAsync('UPDATE products SET catid = ?, name = ?, price = ?, description = ? WHERE pid = ?', [catid, name, price, description, pid]);
    if (req.file) await saveProductImages(pid, req.file.buffer);
    res.redirect('/admin?msg=Product updated');
  } catch {
    res.redirect('/admin?msg=Failed to update product');
  }
});

app.post('/admin/products/delete', async (req, res) => {
  const pid = Number.parseInt(req.body.pid, 10);
  if (!Number.isInteger(pid)) return res.redirect('/admin?msg=Invalid product');
  try {
    await runAsync('DELETE FROM products WHERE pid = ?', [pid]);
    const files = [`pid_${pid}_large.jpg`, `pid_${pid}_thumb.jpg`];
    files.forEach((file) => {
      const filePath = path.join(UPLOAD_DIR, file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
    res.redirect('/admin?msg=Product deleted');
  } catch {
    res.redirect('/admin?msg=Failed to delete product');
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('allowed')) {
    return res.status(400).redirect('/admin?msg=Invalid upload file');
  }
  return res.status(500).send('Internal server error.');
});

app.use((req, res) => res.status(404).send('Page not found.'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AniMall server listening on port ${PORT}`);
});
