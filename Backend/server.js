require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const sqlite3 = require('sqlite3').verbose();

const PORT = Number(process.env.PORT || 80);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'animall.sqlite');
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || '../Frontend/assets/uploads');
const FRONTEND_DIR = path.resolve(__dirname, '../Frontend');
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE_NAME = 'animall.sid';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 48; // 48 hours < 3 days
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';
const MAX_NAME_LENGTH = 120;

if (!SESSION_SECRET) {
  throw new Error('Missing SESSION_SECRET environment variable.');
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' }
}));

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: SESSION_MAX_AGE_MS
  }
}));

app.use((req, res, next) => {
  req.user = req.session ? req.session.user || null : null;
  next();
});

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

const VALID_TYPES = new Set(['Toys', 'Food', 'Treats', 'Accessories', 'Care']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

function isApiRequest(req) {
  return req.path.startsWith('/api');
}

function sendUnauthorized(res) {
  return res.status(401).json({ error: 'Authentication required.' });
}

function sendForbidden(res, message = 'Forbidden') {
  return res.status(403).json({ error: message });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (isApiRequest(req)) return sendUnauthorized(res);
  return res.redirect('/login.html');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_admin) return next();
  if (isApiRequest(req)) return sendForbidden(res, 'Admin access required.');
  return res.redirect('/login.html');
}

function ensureCsrfToken(req, res, next) {
  if (!req.session) return sendForbidden(res, 'Session unavailable.');
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function requireCsrf(req, res, next) {
  if (!req.session || !req.session.csrfToken) {
    return sendForbidden(res, 'Missing CSRF token.');
  }
  const token = req.get('x-csrf-token') || (req.body && req.body.csrfToken);
  if (token && token === req.session.csrfToken) return next();
  if (isApiRequest(req)) return sendForbidden(res, 'Invalid CSRF token.');
  return res.redirect('/login.html');
}

function sanitizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(value) ? value : null;
}

function validatePassword(password) {
  const value = String(password || '');
  return value.length >= MIN_PASSWORD_LENGTH ? value : null;
}

async function findUserByEmail(email) {
  return getAsync('SELECT userid, email, password_hash, name, is_admin FROM users WHERE email = ?', [email]);
}

function pickUserSession(userRow) {
  return {
    userid: userRow.userid,
    email: userRow.email,
    name: userRow.name,
    is_admin: Boolean(userRow.is_admin)
  };
}

function sanitizePrice(price) {
  const parsed = Number(price);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function sanitizeType(type) {
  const value = String(type || '').trim();
  return VALID_TYPES.has(value) ? value : null;
}

async function saveProductImage(pid, fileBuffer, sortOrder) {
  const base = `pid_${pid}_${sortOrder}`;
  const largeRel = `assets/uploads/${base}_large.jpg`;
  const thumbRel = `assets/uploads/${base}_thumb.jpg`;
  const largeAbs = path.join(FRONTEND_DIR, largeRel);
  const thumbAbs = path.join(FRONTEND_DIR, thumbRel);

  await sharp(fileBuffer).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(largeAbs);
  await sharp(fileBuffer).resize({ width: 300, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumbAbs);

  await runAsync(
    'INSERT INTO product_images (pid, sort_order, image_large, image_thumb) VALUES (?, ?, ?, ?)',
    [pid, sortOrder, largeRel, thumbRel]
  );
  if (sortOrder === 0) {
    await runAsync('UPDATE products SET image_large = ?, image_thumb = ? WHERE pid = ?', [largeRel, thumbRel, pid]);
  }
}

app.get('/api/csrf-token', ensureCsrfToken, (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

app.get('/api/auth/me', ensureCsrfToken, (req, res) => {
  const user = req.session && req.session.user ? req.session.user : null;
  res.json({ authenticated: Boolean(user), user, csrfToken: req.session.csrfToken });
});

app.post('/api/auth/register', ensureCsrfToken, requireCsrf, async (req, res) => {
  const email = sanitizeEmail(req.body.email);
  const password = validatePassword(req.body.password);
  const confirm = String(req.body.confirmPassword || '');
  const name = String(req.body.name || '').trim().slice(0, MAX_NAME_LENGTH) || null;

  if (!email || !password || confirm !== req.body.password) {
    return res.status(400).json({ error: 'Invalid registration input.' });
  }

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const now = Date.now();
    const passwordHash = await bcrypt.hash(password, 12);
    await runAsync(
      'INSERT INTO users (email, password_hash, name, is_admin, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      [email, passwordHash, name, now, now]
    );

    res.json({ success: true, message: 'Registration successful.' });
  } catch (err) {
    res.status(500).json({ error: 'Unable to register at this time.' });
  }
});

app.post('/api/auth/login', ensureCsrfToken, requireCsrf, async (req, res) => {
  const email = sanitizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Invalid login input.' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Unable to start session.' });
      req.session.user = pickUserSession(user);
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      res.json({ success: true, user: req.session.user, csrfToken: req.session.csrfToken });
    });
  } catch (err) {
    res.status(500).json({ error: 'Unable to login at this time.' });
  }
});

app.post('/api/auth/logout', requireAuth, ensureCsrfToken, requireCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ success: true });
  });
});

app.post('/api/auth/change-password', requireAuth, ensureCsrfToken, requireCsrf, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = validatePassword(req.body.newPassword);
  const confirmPassword = String(req.body.confirmPassword || '');

  if (!newPassword || newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Invalid password change input.' });
  }

  try {
    const user = await getAsync('SELECT userid, password_hash FROM users WHERE userid = ?', [req.session.user.userid]);
    if (!user) return res.status(401).json({ error: 'Session is invalid.' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(newPassword, 12);
    const now = Date.now();
    await runAsync('UPDATE users SET password_hash = ?, updated_at = ? WHERE userid = ?', [newHash, now, user.userid]);

    req.session.destroy(() => {
      res.clearCookie(SESSION_COOKIE_NAME);
      res.json({ success: true, message: 'Password changed. Please log in again.' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Unable to change password at this time.' });
  }
});

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
    const rows = await allAsync('SELECT pid, catid, name, price, type, image_thumb FROM products WHERE catid = ? ORDER BY pid', [catid]);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Unable to fetch products.' });
  }
});

app.get('/api/product/:pid/images', async (req, res) => {
  const pid = Number.parseInt(req.params.pid, 10);
  if (!Number.isInteger(pid) || pid < 1) return res.status(400).json({ error: 'Invalid product.' });
  try {
    const rows = await allAsync(
      'SELECT imgid, sort_order, image_large, image_thumb FROM product_images WHERE pid = ? ORDER BY sort_order',
      [pid]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Unable to fetch images.' });
  }
});

app.get('/api/product/:pid', async (req, res) => {
  const pid = Number.parseInt(req.params.pid, 10);
  if (!Number.isInteger(pid) || pid < 1) return res.status(400).json({ error: 'Invalid product.' });
  try {
    const row = await getAsync(
      `SELECT p.pid, p.catid, p.name, p.price, p.description, p.type, p.image_large,
              (SELECT pi.image_thumb FROM product_images pi WHERE pi.pid = p.pid ORDER BY pi.sort_order LIMIT 1) AS image_thumb,
              c.name AS category_name
       FROM products p JOIN categories c ON c.catid = p.catid WHERE p.pid = ?`,
      [pid]
    );
    if (!row) return res.status(404).json({ error: 'Product not found.' });
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Unable to fetch product.' });
  }
});

app.get('/api/admin/options', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [categories, products] = await Promise.all([
      allAsync('SELECT catid, name FROM categories ORDER BY catid'),
      allAsync('SELECT pid, name FROM products ORDER BY pid')
    ]);
    res.json({ categories, products, validTypes: Array.from(VALID_TYPES) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load admin options.' });
  }
});

app.get('/admin', async (req, res) => {
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
  res.redirect(`/admin.html${query}`);
});

app.post('/api/admin/categories', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const name = sanitizeName(req.body.name);
  if (!name) return res.status(400).json({ success: false, message: 'Invalid category name' });
  try {
    const result = await runAsync('INSERT INTO categories (name) VALUES (?)', [name]);
    res.json({ success: true, message: 'Category created', data: { catid: result.lastID } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

app.put('/api/admin/categories/:catid', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const catid = Number.parseInt(req.params.catid, 10);
  const name = sanitizeName(req.body.name);
  if (!Number.isInteger(catid) || !name) {
    return res.status(400).json({ success: false, message: 'Invalid category update input' });
  }
  try {
    const result = await runAsync('UPDATE categories SET name = ? WHERE catid = ?', [name, catid]);
    if (!result.changes) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category updated' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
});

app.delete('/api/admin/categories/:catid', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const catid = Number.parseInt(req.params.catid, 10);
  if (!Number.isInteger(catid)) return res.status(400).json({ success: false, message: 'Invalid category' });
  try {
    const result = await runAsync('DELETE FROM categories WHERE catid = ?', [catid]);
    if (!result.changes) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
});

app.post('/api/admin/products', requireAuth, requireAdmin, ensureCsrfToken, upload.array('images', 8), requireCsrf, async (req, res) => {
  const catid = Number.parseInt(req.body.catid, 10);
  const name = sanitizeName(req.body.name);
  const price = sanitizePrice(req.body.price);
  const description = String(req.body.description || '').trim().slice(0, 1000);
  const type = sanitizeType(req.body.type);
  if (!Number.isInteger(catid) || !name || price === null || !type) {
    return res.status(400).json({ success: false, message: 'Invalid product input' });
  }
  try {
    const result = await runAsync('INSERT INTO products (catid, name, price, description, type) VALUES (?, ?, ?, ?, ?)', [catid, name, price, description, type]);
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        await saveProductImage(result.lastID, req.files[i].buffer, i);
      }
    }
    res.json({ success: true, message: 'Product created', data: { pid: result.lastID } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

app.put('/api/admin/products/:pid', requireAuth, requireAdmin, ensureCsrfToken, upload.array('images', 8), requireCsrf, async (req, res) => {
  const pid = Number.parseInt(req.params.pid, 10);
  if (!Number.isInteger(pid)) return res.status(400).json({ success: false, message: 'Invalid product update input' });

  const fields = [];
  const values = [];

  if (req.body.catid) {
    const catid = Number.parseInt(req.body.catid, 10);
    if (!Number.isInteger(catid)) return res.status(400).json({ success: false, message: 'Invalid category' });
    fields.push('catid = ?'); values.push(catid);
  }
  if (req.body.name && req.body.name.trim()) {
    const name = sanitizeName(req.body.name);
    if (!name) return res.status(400).json({ success: false, message: 'Invalid product name' });
    fields.push('name = ?'); values.push(name);
  }
  if (req.body.price !== undefined && req.body.price !== '') {
    const price = sanitizePrice(req.body.price);
    if (price === null) return res.status(400).json({ success: false, message: 'Invalid product price' });
    fields.push('price = ?'); values.push(price);
  }
  if (req.body.description !== undefined && req.body.description.trim() !== '') {
    fields.push('description = ?'); values.push(String(req.body.description).trim().slice(0, 1000));
  }
  if (req.body.type) {
    const type = sanitizeType(req.body.type);
    if (!type) return res.status(400).json({ success: false, message: 'Invalid product type' });
    fields.push('type = ?'); values.push(type);
  }

  if (fields.length === 0 && !(req.files && req.files.length > 0)) {
    return res.status(400).json({ success: false, message: 'No update fields provided' });
  }

  try {
    const existing = await getAsync('SELECT pid FROM products WHERE pid = ?', [pid]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    if (fields.length > 0) {
      values.push(pid);
      await runAsync(`UPDATE products SET ${fields.join(', ')} WHERE pid = ?`, values);
    }
    if (req.files && req.files.length > 0) {
      await runAsync('DELETE FROM product_images WHERE pid = ?', [pid]);
      for (let i = 0; i < req.files.length; i++) {
        await saveProductImage(pid, req.files[i].buffer, i);
      }
    }
    res.json({ success: true, message: 'Product updated' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

app.delete('/api/admin/products/:pid', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const pid = Number.parseInt(req.params.pid, 10);
  if (!Number.isInteger(pid)) return res.status(400).json({ success: false, message: 'Invalid product' });
  try {
    const images = await allAsync('SELECT image_large, image_thumb FROM product_images WHERE pid = ?', [pid]);
    const result = await runAsync('DELETE FROM products WHERE pid = ?', [pid]);
    if (!result.changes) return res.status(404).json({ success: false, message: 'Product not found' });
    images.forEach(({ image_large, image_thumb }) => {
      [image_large, image_thumb].forEach((rel) => {
        if (!rel) return;
        const abs = path.join(FRONTEND_DIR, rel);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      });
    });
    res.json({ success: true, message: 'Product deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

app.post('/admin/categories', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const name = sanitizeName(req.body.name);
  if (!name) return res.redirect('/admin.html?msg=Invalid category name');
  try {
    await runAsync('INSERT INTO categories (name) VALUES (?)', [name]);
    res.redirect('/admin.html?msg=Category created');
  } catch {
    res.redirect('/admin.html?msg=Failed to create category');
  }
});

app.post('/admin/categories/update', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const catid = Number.parseInt(req.body.catid, 10);
  const name = sanitizeName(req.body.name);
  if (!Number.isInteger(catid) || !name) return res.redirect('/admin.html?msg=Invalid category update input');
  try {
    await runAsync('UPDATE categories SET name = ? WHERE catid = ?', [name, catid]);
    res.redirect('/admin.html?msg=Category updated');
  } catch {
    res.redirect('/admin.html?msg=Failed to update category');
  }
});

app.post('/admin/categories/delete', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const catid = Number.parseInt(req.body.catid, 10);
  if (!Number.isInteger(catid)) return res.redirect('/admin.html?msg=Invalid category');
  try {
    await runAsync('DELETE FROM categories WHERE catid = ?', [catid]);
    res.redirect('/admin.html?msg=Category deleted');
  } catch {
    res.redirect('/admin.html?msg=Failed to delete category');
  }
});

app.post('/admin/products', requireAuth, requireAdmin, ensureCsrfToken, upload.array('images', 8), requireCsrf, async (req, res) => {
  const catid = Number.parseInt(req.body.catid, 10);
  const name = sanitizeName(req.body.name);
  const price = sanitizePrice(req.body.price);
  const description = String(req.body.description || '').trim().slice(0, 1000);
  const type = sanitizeType(req.body.type);
  if (!Number.isInteger(catid) || !name || price === null || !type) return res.redirect('/admin.html?msg=Invalid product input');
  try {
    const result = await runAsync('INSERT INTO products (catid, name, price, description, type) VALUES (?, ?, ?, ?, ?)', [catid, name, price, description, type]);
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        await saveProductImage(result.lastID, req.files[i].buffer, i);
      }
    }
    res.redirect('/admin.html?msg=Product created');
  } catch {
    res.redirect('/admin.html?msg=Failed to create product');
  }
});

app.post('/admin/products/update', requireAuth, requireAdmin, ensureCsrfToken, upload.array('images', 8), requireCsrf, async (req, res) => {
  const pid = Number.parseInt(req.body.pid, 10);
  if (!Number.isInteger(pid)) return res.redirect('/admin.html?msg=Invalid product update input');

  const fields = [];
  const values = [];

  if (req.body.catid) {
    const catid = Number.parseInt(req.body.catid, 10);
    if (!Number.isInteger(catid)) return res.redirect('/admin.html?msg=Invalid category');
    fields.push('catid = ?'); values.push(catid);
  }
  if (req.body.name && req.body.name.trim()) {
    const name = sanitizeName(req.body.name);
    if (!name) return res.redirect('/admin.html?msg=Invalid product name');
    fields.push('name = ?'); values.push(name);
  }
  if (req.body.price !== undefined && req.body.price !== '') {
    const price = sanitizePrice(req.body.price);
    if (price === null) return res.redirect('/admin.html?msg=Invalid product price');
    fields.push('price = ?'); values.push(price);
  }
  if (req.body.description !== undefined && req.body.description.trim() !== '') {
    fields.push('description = ?'); values.push(String(req.body.description).trim().slice(0, 1000));
  }
  if (req.body.type) {
    const type = sanitizeType(req.body.type);
    if (!type) return res.redirect('/admin.html?msg=Invalid product type');
    fields.push('type = ?'); values.push(type);
  }

  if (fields.length === 0 && !(req.files && req.files.length > 0)) {
    return res.redirect('/admin.html?msg=No update fields provided');
  }

  try {
    if (fields.length > 0) {
      values.push(pid);
      await runAsync(`UPDATE products SET ${fields.join(', ')} WHERE pid = ?`, values);
    }
    if (req.files && req.files.length > 0) {
      await runAsync('DELETE FROM product_images WHERE pid = ?', [pid]);
      for (let i = 0; i < req.files.length; i++) {
        await saveProductImage(pid, req.files[i].buffer, i);
      }
    }
    res.redirect('/admin.html?msg=Product updated');
  } catch {
    res.redirect('/admin.html?msg=Failed to update product');
  }
});

app.post('/admin/products/delete', requireAuth, requireAdmin, ensureCsrfToken, requireCsrf, async (req, res) => {
  const pid = Number.parseInt(req.body.pid, 10);
  if (!Number.isInteger(pid)) return res.redirect('/admin.html?msg=Invalid product');
  try {
    const images = await allAsync('SELECT image_large, image_thumb FROM product_images WHERE pid = ?', [pid]);
    await runAsync('DELETE FROM products WHERE pid = ?', [pid]);
    images.forEach(({ image_large, image_thumb }) => {
      [image_large, image_thumb].forEach((rel) => {
        if (!rel) return;
        const abs = path.join(FRONTEND_DIR, rel);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      });
    });
    res.redirect('/admin.html?msg=Product deleted');
  } catch {
    res.redirect('/admin.html?msg=Failed to delete product');
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || (typeof err.message === 'string' && err.message.includes('allowed'))) {
    if (req.path.startsWith('/api/admin/')) {
      return res.status(400).json({ success: false, message: 'Invalid upload file' });
    }
    return res.status(400).redirect('/admin?msg=Invalid upload file');
  }
  return res.status(500).send('Internal server error.');
});

app.use((req, res) => res.status(404).send('Page not found.'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AniMall server listening on port ${PORT}`);
});
