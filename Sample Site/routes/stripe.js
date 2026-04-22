const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../database/db');
const router = express.Router();

const stripe = require('stripe')(`${process.env.STRIPE_SECRET_KEY}`);

router.post('/create-checkout-session', authenticate, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured' });
  const { items, shipping } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Cart is empty' });
  const db = getDb();

  let subtotal = 0;

  const line_items = [];
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(item.id);
    if (!product) return res.status(400).json({ error: `Product ${item.id} not found` });
    line_items.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: product.name,
          description: (product.description || '').slice(0, 400),
          images: product.image_url ? [`${process.env.BASE_URL}${product.image_url}`] : []
        },
        unit_amount: Math.round(product.price * 100)
      },
      quantity: parseInt(item.quantity, 10)
    });
    subtotal += product.price * parseInt(item.quantity, 10);
  }
  const taxRate = parseFloat(process.env.TAX_RATE || '0.08');
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      customer_email: req.user.email,
      success_url: `${process.env.FRONTEND_URL}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/checkout.html`,
      metadata: { user_id: String(req.user.id) }
    });

    db.prepare(`
      INSERT INTO orders (user_id,status,subtotal,tax,total,shipping_name,shipping_email,shipping_address, stripe_session_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      req.user.id,
      'pending',
      subtotal,
      tax,
      total,
      shipping?.name || req.user.username,
      shipping?.email || req.user.email,
      shipping?.address || '',
      session.id,
    );

    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

router.post('/webhook', (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    getDb().prepare(`
      UPDATE orders
      SET status='paid', stripe_session_id=?, stripe_payment_intent=?, updated_at=CURRENT_TIMESTAMP
      WHERE stripe_session_id=?
    `).run(session.id, session.payment_intent, session.id);
  }

  res.json({ received: true });
});

module.exports = router;
