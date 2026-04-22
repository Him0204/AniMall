const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getDb } = require('../database/db');
const router = express.Router();

router.use(requireAdmin);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

router.get('/products', (req, res) => {
  const rows = getDb().prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/products', upload.single('image'), [
  body('name').trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description, price, stock, category_id, stripe_price_id } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  const result = getDb().prepare(`
    INSERT INTO products (category_id,name,slug,description,price,stock,image_url,stripe_price_id,is_active)
    VALUES (?,?,?,?,?,?,?,?,1)
  `).run(category_id || null, name, slugify(name), description || '', parseFloat(price), parseInt(stock, 10), image_url, stripe_price_id || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/products/:id', upload.single('image'), (req, res) => {
  const db = getDb();
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Product not found' });

  const data = {
    name: req.body.name ?? current.name,
    description: req.body.description ?? current.description,
    price: req.body.price !== undefined ? parseFloat(req.body.price) : current.price,
    stock: req.body.stock !== undefined ? parseInt(req.body.stock, 10) : current.stock,
    category_id: req.body.category_id !== undefined ? (req.body.category_id || null) : current.category_id,
    image_url: req.file ? `/uploads/${req.file.filename}` : current.image_url,
    stripe_price_id: req.body.stripe_price_id ?? current.stripe_price_id,
    is_active: req.body.is_active !== undefined ? parseInt(req.body.is_active, 10) : current.is_active
  };

  db.prepare(`
    UPDATE products
    SET category_id=?, name=?, slug=?, description=?, price=?, stock=?, image_url=?, stripe_price_id=?, is_active=?
    WHERE id=?
  `).run(data.category_id, data.name, slugify(data.name), data.description, data.price, data.stock, data.image_url, data.stripe_price_id, data.is_active, req.params.id);

  res.json({ success: true });
});

router.delete('/products/:id', (req, res) => {
  getDb().prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/categories', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM categories ORDER BY name').all());
});

router.post('/categories', upload.single('image'), [body('name').trim().notEmpty()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, description } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  const result = getDb().prepare('INSERT INTO categories (name,slug,description,image_url) VALUES (?,?,?,?)')
    .run(name, slugify(name), description || '', image_url);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/categories/:id', upload.single('image'), (req, res) => {
  const db = getDb();
  const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Category not found' });
  const name = req.body.name ?? current.name;
  const description = req.body.description ?? current.description;
  const image_url = req.file ? `/uploads/${req.file.filename}` : current.image_url;
  db.prepare('UPDATE categories SET name=?, slug=?, description=?, image_url=? WHERE id=?')
    .run(name, slugify(name), description, image_url, req.params.id);
  res.json({ success: true });
});

router.delete('/categories/:id', (req, res) => {
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/orders', (req, res) => {
  const rows = getDb().prepare(`
    SELECT o.*, u.username, u.email
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/orders/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ ...order, items });
});

router.put('/orders/:id/status', [body('status').isIn(['pending','paid','shipped','delivered','cancelled'])], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  getDb().prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.body.status, req.params.id);
  res.json({ success: true });
});

router.get('/users', (req, res) => {
  const users = getDb().prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

module.exports = router;
