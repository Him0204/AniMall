require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const sqlite3 = require('sqlite3').verbose();

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'animall.sqlite');
const SESSION_STORE_PATH = path.join(__dirname, 'db', 'sessions.sqlite');
const UPLOAD_DIR = path.resolve(__dirname, process.env.UPLOAD_DIR || '../Frontend/assets/uploads');
const FRONTEND_DIR = path.resolve(__dirname, '../Frontend');
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE_NAME = 'animall.sid';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 48; // 48 hours < 3 days
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';
const MAX_NAME_LENGTH = 120;
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_CURRENCY = String(process.env.STRIPE_CURRENCY || 'hkd').toLowerCase();
const MERCHANT_EMAIL = String(process.env.MERCHANT_EMAIL || '').trim().toLowerCase();
const ORDER_DIGEST_SECRET = process.env.ORDER_DIGEST_SECRET || SESSION_SECRET;
const STRIPE_WEBHOOK_PATHS = ['/api/webhooks/stripe', '/api/webhook/stripe', '/api/stripe/webhook'];
const DEFAULT_MEMBER_PAID_LIMIT = 5;
const MAX_MEMBER_PAID_LIMIT = 50;

function normalizeRequestPath(urlLike) {
  const pathOnly = String(urlLike || '').split('?')[0];
  const trimmed = pathOnly.replace(/\/+$/, '');
  return trimmed || '/';
}

function isStripeWebhookRequest(req) {
  const requestPath = normalizeRequestPath(req && (req.originalUrl || req.url));
  return STRIPE_WEBHOOK_PATHS.includes(requestPath);
}

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(STRIPE_SECRET_KEY);
  } catch (err) {
    console.error('Stripe SDK unavailable:', err.message);
  }
}

if (!SESSION_SECRET) {
  throw new Error('Missing SESSION_SECRET environment variable.');
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(SESSION_STORE_PATH), { recursive: true });

const app = express();
app.set('trust proxy', 1);
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
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if (isStripeWebhookRequest(req)) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({
    dir: path.dirname(SESSION_STORE_PATH),
    db: path.basename(SESSION_STORE_PATH),
    table: 'sessions'
  }),
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
const MAX_PASSWORD_LENGTH = 64;
// Require letters and digits; allow only safe characters; disallow quotes/whitespace to prevent SQL-looking inputs.
const PASSWORD_COMPLEXITY = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+=-]{10,64}$/;

if (!EMAIL_PATTERN.test(MERCHANT_EMAIL)) {
  throw new Error('Missing or invalid MERCHANT_EMAIL environment variable.');
}

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
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) return null;
  return PASSWORD_COMPLEXITY.test(value) ? value : null;
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

function toPositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function moneyToCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function centsToMoney(cents) {
  if (!Number.isInteger(cents) || cents < 0) return null;
  return cents / 100;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSqliteConstraintError(err) {
  return Boolean(err) && (err.code === 'SQLITE_CONSTRAINT' || String(err.message || '').includes('SQLITE_CONSTRAINT'));
}

function normalizeCheckoutItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) return null;

  const aggregated = new Map();
  for (const item of items) {
    if (!isPlainObject(item)) return null;
    const keys = Object.keys(item);
    if (keys.length !== 2 || !keys.includes('pid') || !keys.includes('quantity')) return null;

    const pid = toPositiveInt(item.pid);
    const quantity = toPositiveInt(item.quantity);
    if (!pid || !quantity || quantity > 1000) return null;

    const totalQty = (aggregated.get(pid) || 0) + quantity;
    if (totalQty > 1000) return null;
    aggregated.set(pid, totalQty);
  }

  return Array.from(aggregated.entries())
    .map(([pid, quantity]) => ({ pid, quantity }))
    .sort((a, b) => a.pid - b.pid);
}

function buildDigestInput({ currency, merchantEmail, salt, items, totalAmountCents }) {
  const lines = items
    .map((item) => `${item.pid}:${item.quantity}:${item.unit_price_cents}`)
    .join('|');
  return `${currency}|${merchantEmail}|${salt}|${lines}|${totalAmountCents}`;
}

function computeOrderDigest(digestInput) {
  return crypto
    .createHmac('sha256', ORDER_DIGEST_SECRET)
    .update(digestInput)
    .digest('hex');
}

async function createPendingOrder(userid, normalizedItems) {
  const pids = normalizedItems.map((item) => item.pid);
  const placeholders = pids.map(() => '?').join(',');
  const products = await allAsync(
    `SELECT pid, name, price FROM products WHERE pid IN (${placeholders})`,
    pids
  );

  if (products.length !== pids.length) {
    return { error: 'One or more products are unavailable.' };
  }

  const productMap = new Map(products.map((product) => [product.pid, product]));
  const canonicalItems = [];
  let totalAmountCents = 0;

  for (const item of normalizedItems) {
    const product = productMap.get(item.pid);
    if (!product) {
      return { error: 'One or more products are unavailable.' };
    }
    const unitPriceCents = moneyToCents(product.price);
    if (unitPriceCents === null) {
      return { error: 'One or more products has an invalid price.' };
    }

    const lineTotalCents = unitPriceCents * item.quantity;
    totalAmountCents += lineTotalCents;
    canonicalItems.push({
      pid: item.pid,
      quantity: item.quantity,
      product_name: String(product.name || 'Product').slice(0, MAX_NAME_LENGTH),
      unit_price_cents: unitPriceCents,
      line_total_cents: lineTotalCents
    });
  }

  const currency = STRIPE_CURRENCY.toUpperCase();
  const salt = crypto.randomBytes(32).toString('hex');
  const digestInput = buildDigestInput({
    currency,
    merchantEmail: MERCHANT_EMAIL,
    salt,
    items: canonicalItems,
    totalAmountCents
  });
  const digest = computeOrderDigest(digestInput);
  const now = Date.now();

  await runAsync('BEGIN IMMEDIATE');
  try {
    const inserted = await runAsync(
      `INSERT INTO orders
        (userid, currency, merchant_id, digest_salt, digest, total_amount_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [userid, currency, MERCHANT_EMAIL, salt, digest, totalAmountCents, now, now]
    );

    for (const item of canonicalItems) {
      await runAsync(
        `INSERT INTO order_items
          (orderid, pid, product_name, quantity, unit_price_cents, line_total_cents)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [inserted.lastID, item.pid, item.product_name, item.quantity, item.unit_price_cents, item.line_total_cents]
      );
    }

    await runAsync('COMMIT');

    return {
      orderId: inserted.lastID,
      currency,
      totalAmountCents,
      digest,
      digestInput,
      digestSalt: salt,
      items: canonicalItems
    };
  } catch (err) {
    await runAsync('ROLLBACK').catch(() => {});
    throw err;
  }
}

function buildCheckoutReturnUrls(orderId) {
  return {
    successUrl: `${APP_BASE_URL}/checkout.html?result=success&orderId=${orderId}`,
    cancelUrl: `${APP_BASE_URL}/checkout.html?result=cancel&orderId=${orderId}`
  };
}

async function createStripeCheckoutSessionForOrder({ orderId, userId, currency, items }) {
  if (!stripe) {
    return { error: 'Checkout service is unavailable.', status: 503 };
  }

  if (!Array.isArray(items) || items.length < 1) {
    return { error: 'Order has no payable items.', status: 400 };
  }

  const normalizedLineItems = [];
  for (const item of items) {
    const quantity = toPositiveInt(item.quantity);
    const unitPriceCents = Number.parseInt(String(item.unit_price_cents), 10);
    const productName = String(item.product_name || 'Product').slice(0, MAX_NAME_LENGTH);

    if (!quantity || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      return { error: 'Invalid order item data.', status: 400 };
    }

    normalizedLineItems.push({
      quantity,
      price_data: {
        currency: String(currency || STRIPE_CURRENCY).toLowerCase(),
        unit_amount: unitPriceCents,
        product_data: {
          name: productName
        }
      }
    });
  }

  const urls = buildCheckoutReturnUrls(orderId);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: normalizedLineItems,
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    client_reference_id: String(orderId),
    metadata: {
      orderId: String(orderId),
      userId: String(userId),
      merchantEmail: MERCHANT_EMAIL
    }
  });

  await runAsync(
    'UPDATE orders SET stripe_checkout_session_id = ?, updated_at = ? WHERE orderid = ?',
    [session.id, Date.now(), orderId]
  );

  return { success: true, checkoutUrl: session.url };
}

async function fetchOrderWithItemsForUser(orderId, userId) {
  const order = await getAsync(
    `SELECT orderid, userid, currency, total_amount_cents, status,
            stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at
     FROM orders
     WHERE orderid = ? AND userid = ?`,
    [orderId, userId]
  );

  if (!order) return null;

  const items = await allAsync(
    `SELECT orderid, pid, product_name, quantity, unit_price_cents, line_total_cents
     FROM order_items
     WHERE orderid = ?
     ORDER BY order_itemid ASC`,
    [orderId]
  );

  return { order, items };
}

function formatOrderResponse(order, itemsByOrderId = new Map()) {
  return {
    orderid: order.orderid,
    userid: order.userid,
    user_email: order.user_email || null,
    currency: order.currency,
    total_amount_cents: order.total_amount_cents,
    total_amount: centsToMoney(order.total_amount_cents),
    status: order.status,
    stripe_checkout_session_id: order.stripe_checkout_session_id || null,
    stripe_payment_intent_id: order.stripe_payment_intent_id || null,
    created_at: order.created_at,
    paid_at: order.paid_at || null,
    items: itemsByOrderId.get(order.orderid) || []
  };
}

function mapOrderItemsByOrderId(rows) {
  const itemMap = new Map();
  rows.forEach((row) => {
    const list = itemMap.get(row.orderid) || [];
    list.push({
      pid: row.pid,
      product_name: row.product_name,
      quantity: row.quantity,
      unit_price_cents: row.unit_price_cents,
      unit_price: centsToMoney(row.unit_price_cents),
      line_total_cents: row.line_total_cents,
      line_total: centsToMoney(row.line_total_cents)
    });
    itemMap.set(row.orderid, list);
  });
  return itemMap;
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

app.post('/api/checkout', requireAuth, ensureCsrfToken, requireCsrf, async (req, res) => {
  if (!isPlainObject(req.body) || Object.keys(req.body).length !== 1 || !Object.prototype.hasOwnProperty.call(req.body, 'items')) {
    return res.status(400).json({ error: 'Invalid checkout input.' });
  }

  const normalizedItems = normalizeCheckoutItems(req.body.items);
  if (!normalizedItems) {
    return res.status(400).json({ error: 'Invalid checkout items.' });
  }

  let pendingOrder = null;
  try {
    pendingOrder = await createPendingOrder(req.session.user.userid, normalizedItems);
    if (pendingOrder.error) {
      return res.status(400).json({ error: pendingOrder.error });
    }

    const checkoutSession = await createStripeCheckoutSessionForOrder({
      orderId: pendingOrder.orderId,
      userId: req.session.user.userid,
      currency: pendingOrder.currency,
      items: pendingOrder.items
    });

    if (!checkoutSession.success) {
      return res.status(checkoutSession.status || 500).json({ error: checkoutSession.error || 'Unable to initialize checkout.' });
    }

    return res.json({
      success: true,
      orderId: pendingOrder.orderId,
      checkoutUrl: checkoutSession.checkoutUrl
    });
  } catch (err) {
    if (pendingOrder && pendingOrder.orderId) {
      await runAsync(
        "UPDATE orders SET status = 'failed', updated_at = ? WHERE orderid = ? AND status = 'pending'",
        [Date.now(), pendingOrder.orderId]
      ).catch(() => {});
    }
    return res.status(500).json({ error: 'Unable to initialize checkout at this time.' });
  }
});

app.get('/api/orders/member', requireAuth, async (req, res) => {
  const paidLimitRaw = Number.parseInt(String(req.query.paidLimit || ''), 10);
  const paidLimit = Number.isInteger(paidLimitRaw) && paidLimitRaw > 0 && paidLimitRaw <= MAX_MEMBER_PAID_LIMIT
    ? paidLimitRaw
    : DEFAULT_MEMBER_PAID_LIMIT;

  try {
    const [pendingOrders, paidOrders] = await Promise.all([
      allAsync(
        `SELECT orderid, userid, currency, total_amount_cents, status,
                stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at
         FROM orders
         WHERE userid = ? AND status = 'pending'
         ORDER BY created_at DESC`,
        [req.session.user.userid]
      ),
      allAsync(
        `SELECT orderid, userid, currency, total_amount_cents, status,
                stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at
         FROM orders
         WHERE userid = ? AND status = 'paid'
         ORDER BY created_at DESC
         LIMIT ?`,
        [req.session.user.userid, paidLimit]
      )
    ]);

    const orders = [...pendingOrders, ...paidOrders];
    if (!orders.length) {
      return res.json({ success: true, orders: [] });
    }

    const placeholders = orders.map(() => '?').join(',');
    const items = await allAsync(
      `SELECT orderid, pid, product_name, quantity, unit_price_cents, line_total_cents
       FROM order_items
       WHERE orderid IN (${placeholders})
       ORDER BY orderid DESC, order_itemid ASC`,
      orders.map((order) => order.orderid)
    );

    const itemMap = mapOrderItemsByOrderId(items);
    return res.json({ success: true, orders: orders.map((order) => formatOrderResponse(order, itemMap)) });
  } catch {
    return res.status(500).json({ error: 'Unable to load member orders.' });
  }
});

app.get('/api/orders/:orderId(\\d+)', requireAuth, async (req, res) => {
  const orderId = toPositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order ID.' });
  }

  try {
    const orderData = await fetchOrderWithItemsForUser(orderId, req.session.user.userid);
    if (!orderData) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const itemMap = mapOrderItemsByOrderId(orderData.items);
    return res.json({ success: true, order: formatOrderResponse(orderData.order, itemMap) });
  } catch {
    return res.status(500).json({ error: 'Unable to load order details.' });
  }
});

app.post('/api/orders/:orderId(\\d+)/checkout-session', requireAuth, ensureCsrfToken, requireCsrf, async (req, res) => {
  const orderId = toPositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order ID.' });
  }

  try {
    const orderData = await fetchOrderWithItemsForUser(orderId, req.session.user.userid);
    if (!orderData) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (orderData.order.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending orders can continue payment.' });
    }

    const checkoutSession = await createStripeCheckoutSessionForOrder({
      orderId: orderData.order.orderid,
      userId: req.session.user.userid,
      currency: orderData.order.currency,
      items: orderData.items
    });

    if (!checkoutSession.success) {
      return res.status(checkoutSession.status || 500).json({ error: checkoutSession.error || 'Unable to create checkout session.' });
    }

    return res.json({
      success: true,
      orderId: orderData.order.orderid,
      checkoutUrl: checkoutSession.checkoutUrl
    });
  } catch {
    return res.status(500).json({ error: 'Unable to continue payment.' });
  }
});

app.post('/api/orders/:orderId(\\d+)/cancel', requireAuth, ensureCsrfToken, requireCsrf, async (req, res) => {
  const orderId = toPositiveInt(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ error: 'Invalid order ID.' });
  }

  const now = Date.now();

  try {
    const result = await runAsync(
      "UPDATE orders SET status = 'cancelled', updated_at = ? WHERE orderid = ? AND userid = ? AND status = 'pending'",
      [now, orderId, req.session.user.userid]
    );

    if (!result.changes) {
      const existing = await getAsync('SELECT orderid, status FROM orders WHERE orderid = ? AND userid = ?', [orderId, req.session.user.userid]);
      if (!existing) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      return res.status(409).json({ error: 'Only pending orders can be cancelled.' });
    }

    return res.json({ success: true, orderId, status: 'cancelled' });
  } catch {
    return res.status(500).json({ error: 'Unable to cancel pending order.' });
  }
});

app.post(STRIPE_WEBHOOK_PATHS, async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook service is unavailable.' });
  }

  if (process.env.NODE_ENV === 'production') {
    const forwardedProto = req.get('x-forwarded-proto');
    const isSecure = req.secure || forwardedProto === 'https';
    if (!isSecure) {
      return res.status(400).json({ error: 'HTTPS is required.' });
    }
  }

  const signature = req.get('stripe-signature');
  if (!signature || !req.rawBody) {
    return res.status(400).json({ error: 'Missing webhook signature.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  let webhookEventId = null;
  try {
    const inserted = await runAsync(
      `INSERT INTO webhook_events
        (provider, external_event_id, event_type, payload, processed, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      ['stripe', event.id, event.type, req.rawBody.toString('utf8'), Date.now()]
    );
    webhookEventId = inserted.lastID;
  } catch (err) {
    if (isSqliteConstraintError(err)) {
      return res.json({ received: true, duplicate: true });
    }
    return res.status(500).json({ error: 'Unable to record webhook event.' });
  }

  try {
    if (event.type !== 'checkout.session.completed') {
      await runAsync(
        'UPDATE webhook_events SET processed = 1, processed_at = ? WHERE webhook_eventid = ?',
        [Date.now(), webhookEventId]
      );
      return res.json({ received: true });
    }

    const eventSession = event.data && event.data.object ? event.data.object : null;
    const orderId = toPositiveInt(
      eventSession
      && ((eventSession.metadata && eventSession.metadata.orderId) || eventSession.client_reference_id)
    );

    if (!orderId) {
      await runAsync(
        'UPDATE webhook_events SET processed = 1, processed_at = ? WHERE webhook_eventid = ?',
        [Date.now(), webhookEventId]
      );
      return res.json({ received: true });
    }

    const order = await getAsync(
      `SELECT orderid, userid, currency, merchant_id, digest_salt, digest,
              total_amount_cents, status, stripe_payment_intent_id
       FROM orders WHERE orderid = ?`,
      [orderId]
    );

    if (!order) {
      return res.status(400).json({ error: 'Unknown order for webhook event.' });
    }

    const orderItems = await allAsync(
      'SELECT orderid, pid, quantity, unit_price_cents FROM order_items WHERE orderid = ? ORDER BY pid',
      [orderId]
    );

    const recomputedDigestInput = buildDigestInput({
      currency: order.currency,
      merchantEmail: order.merchant_id,
      salt: order.digest_salt,
      items: orderItems,
      totalAmountCents: order.total_amount_cents
    });
    const recomputedDigest = computeOrderDigest(recomputedDigestInput);

    const amountTotal = Number.isInteger(eventSession.amount_total)
      ? eventSession.amount_total
      : Number.parseInt(String(eventSession.amount_total), 10);
    const currency = String(eventSession.currency || '').toUpperCase();
    const digestMatches = recomputedDigest === order.digest;
    const amountMatches = Number.isInteger(amountTotal) && amountTotal === order.total_amount_cents;
    const currencyMatches = currency === order.currency;

    if (!digestMatches || !amountMatches || !currencyMatches) {
      await runAsync(
        'UPDATE webhook_events SET orderid = ?, processed = 1, processed_at = ? WHERE webhook_eventid = ?',
        [orderId, Date.now(), webhookEventId]
      );
      await runAsync(
        "UPDATE orders SET status = 'failed', updated_at = ? WHERE orderid = ? AND status = 'pending'",
        [Date.now(), orderId]
      );
      return res.status(400).json({ error: 'Webhook payload validation failed.' });
    }

    if (order.status === 'paid') {
      await runAsync(
        'UPDATE webhook_events SET orderid = ?, processed = 1, processed_at = ? WHERE webhook_eventid = ?',
        [orderId, Date.now(), webhookEventId]
      );
      return res.json({ received: true, duplicate: true });
    }

    const paidAt = Date.now();
    await runAsync('BEGIN IMMEDIATE');
    try {
      await runAsync(
        `UPDATE orders
         SET status = 'paid',
             stripe_payment_intent_id = ?,
             stripe_event_id = ?,
             paid_at = ?,
             updated_at = ?
         WHERE orderid = ?`,
        [
          eventSession.payment_intent ? String(eventSession.payment_intent) : null,
          event.id,
          paidAt,
          paidAt,
          orderId
        ]
      );

      await runAsync(
        'UPDATE webhook_events SET orderid = ?, processed = 1, processed_at = ? WHERE webhook_eventid = ?',
        [orderId, paidAt, webhookEventId]
      );

      await runAsync('COMMIT');
    } catch (err) {
      await runAsync('ROLLBACK').catch(() => {});
      throw err;
    }

    return res.json({ received: true });
  } catch {
    return res.status(500).json({ error: 'Unable to process webhook event.' });
  }
});

app.get('/api/orders/recent', requireAuth, async (req, res) => {
  try {
    const orders = await allAsync(
      `SELECT orderid, userid, currency, total_amount_cents, status,
              stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at
       FROM orders
       WHERE userid = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [req.session.user.userid]
    );

    if (orders.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    const placeholders = orders.map(() => '?').join(',');
    const items = await allAsync(
      `SELECT orderid, pid, product_name, quantity, unit_price_cents, line_total_cents
       FROM order_items
       WHERE orderid IN (${placeholders})
       ORDER BY orderid DESC, order_itemid ASC`,
      orders.map((order) => order.orderid)
    );

    const itemMap = mapOrderItemsByOrderId(items);
    return res.json({ success: true, orders: orders.map((order) => formatOrderResponse(order, itemMap)) });
  } catch {
    return res.status(500).json({ error: 'Unable to load recent orders.' });
  }
});

app.get('/api/admin/orders', requireAuth, requireAdmin, async (req, res) => {
  const limitRaw = Number.parseInt(String(req.query.limit || '50'), 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 50;

  try {
    const orders = await allAsync(
      `SELECT o.orderid, o.userid, u.email AS user_email,
              o.currency, o.total_amount_cents, o.status,
              o.stripe_checkout_session_id, o.stripe_payment_intent_id,
              o.created_at, o.paid_at
       FROM orders o
       LEFT JOIN users u ON u.userid = o.userid
       ORDER BY o.created_at DESC
       LIMIT ?`,
      [limit]
    );

    if (orders.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    const placeholders = orders.map(() => '?').join(',');
    const items = await allAsync(
      `SELECT orderid, pid, product_name, quantity, unit_price_cents, line_total_cents
       FROM order_items
       WHERE orderid IN (${placeholders})
       ORDER BY orderid DESC, order_itemid ASC`,
      orders.map((order) => order.orderid)
    );

    const itemMap = mapOrderItemsByOrderId(items);
    return res.json({ success: true, orders: orders.map((order) => formatOrderResponse(order, itemMap)) });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load orders.' });
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

app.get('/admin/categories', async (req, res) => {
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
  res.redirect(`/admin.html${query}`);
});

app.get('/admin/products', async (req, res) => {
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
  res.redirect(`/admin-products.html${query}`);
});

app.get('/admin/orders', async (req, res) => {
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
  res.redirect(`/admin-orders.html${query}`);
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
