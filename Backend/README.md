# AniMall Phase 4

## Install
```bash
cd Backend
npm install
```

## Initialize DB
```bash
npm run init-db
```

## Mirgrate DB
```bash
npm run migrate-db
```

## Start server
```bash
npm start
```

## Phase 5 Stripe setup

1. Configure environment variables in Backend/.env

```bash
APP_BASE_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=hkd
MERCHANT_EMAIL=merchant@example.com
ORDER_DIGEST_SECRET=long-random-secret
```

2. Re-run migration to ensure Phase 5 tables exist

```bash
npm run migrate-db
```

3. Stripe webhook target (local)

```text
POST /api/webhooks/stripe
```
