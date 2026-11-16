# AniMall backend

The backend serves the static frontend, JSON APIs, session authentication, SQLite
storage, image uploads, and optional Stripe checkout/webhooks.

## Install
```bash
cd Backend
npm install
```

## Configure

Copy `.env.example` to `.env` and set at least a long random `SESSION_SECRET`.
To create an administrator during migration, also set `ADMIN_EMAIL` and
`ADMIN_PASSWORD`. `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` are optional.
Never commit `.env` or generated SQLite files.

## Initialize the database
```bash
npm run init-db
```

## Apply migrations
```bash
npm run migrate-db
```

## Start server
```bash
npm start
```

## Stripe setup (optional)

Set these variables in `Backend/.env`:

```bash
APP_BASE_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=hkd
MERCHANT_EMAIL=merchant@example.com
ORDER_DIGEST_SECRET=long-random-secret
```

Then re-run the migration to create the checkout tables:

```bash
npm run migrate-db
```

Stripe webhook endpoint:

```text
POST /api/webhooks/stripe
```
