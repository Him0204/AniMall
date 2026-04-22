const express = require('express');
const { getDb } = require('../database/db');
const router = express.Router();

router.get('/', (req, res) => {
  const categories = getDb().prepare(`
    SELECT c.*, COUNT(p.id) AS product_count
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  res.json(categories);
});

router.get('/:slug', (req, res) => {
  const category = getDb().prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
  if (!category) return res.status(404).json({ error: 'Category not found' });
  res.json(category);
});

module.exports = router;
