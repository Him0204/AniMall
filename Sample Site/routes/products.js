const express = require('express');
const { getDb } = require('../database/db');
const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { category, search, page = 1, limit = 12 } = req.query;
  const perPage = parseInt(limit, 10);
  const offset = (parseInt(page, 10) - 1) * perPage;
  let where = 'WHERE p.is_active = 1';
  const params = [];

  if (category) { where += ' AND c.slug = ?'; params.push(category); }
  if (search) { where += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const from = `FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS count ${from}`).get(...params).count;
  const products = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    ${from}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  res.json({ products, total, page: parseInt(page, 10), limit: perPage });
});

router.get('/:slug', (req, res) => {
  const product = getDb().prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ? AND p.is_active = 1
  `).get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

module.exports = router;
