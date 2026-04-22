const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../database/db');
const router = express.Router();

router.post('/', authenticate, (req, res) => {
  const { items, shipping } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  const db = getDb();
  const taxRate = parseFloat(process.env.TAX_RATE || '0.08');
  const prepared = [];
  let subtotal = 0;

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(item.id);
    if (!product) return res.status(400).json({ error: `Invalid product ${item.id}` });
    const qty = parseInt(item.quantity, 10);
    if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (product.stock < qty) return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    prepared.push({ product, quantity: qty });
    subtotal += product.price * qty;
  }

  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO orders (user_id,status,subtotal,tax,total,shipping_name,shipping_email,shipping_address)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      req.user.id,
      'pending',
      subtotal,
      tax,
      total,
      shipping?.name || req.user.username,
      shipping?.email || req.user.email,
      shipping?.address || ''
    );

    for (const entry of prepared) {
      db.prepare(`
        INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,total_price)
        VALUES (?,?,?,?,?,?)
      `).run(
        result.lastInsertRowid,
        entry.product.id,
        entry.product.name,
        entry.quantity,
        entry.product.price,
        entry.quantity * entry.product.price
      );
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(entry.quantity, entry.product.id);
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(result.lastInsertRowid);
    return { ...order, items: orderItems };
  });

  try {
    res.status(201).json(tx());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.get('/mine', authenticate, (req, res) => {
  const orders = getDb().prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(orders);
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items });
});

module.exports = router;
