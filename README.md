# AniMall

AniMall is a pet-products shopping website built for IERG4210. It includes a
plain HTML/CSS/JavaScript storefront, an Express backend, SQLite persistence,
session-based authentication, an admin panel, product image uploads, and
optional Stripe checkout integration.

## Repository layout

- `Frontend/` - storefront pages, styles, scripts, and product images
- `Backend/` - Express server, database initialization/migrations, and APIs
- `Sample Site/` - an earlier insecure reference implementation kept for comparison

## Requirements

- Node.js 18 or newer
- npm

## Run locally

1. Configure the backend:

   ```bash
   cd Backend
   cp .env.example .env
   ```

   Set a long random `SESSION_SECRET`. Set `ADMIN_EMAIL` and
   `ADMIN_PASSWORD` if an administrator should be seeded during migration.

2. Install dependencies and initialize the database:

   ```bash
   npm install
   npm run init-db
   npm run migrate-db
   ```

3. Start the application:

   ```bash
   npm start
   ```

Open <http://localhost:3000>. The backend serves the contents of `Frontend/`.

## Stripe

Stripe is optional for local development. To enable checkout, configure
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL`, and the other
Stripe-related values documented in [`Backend/README.md`](Backend/README.md).

## Security and publication notes

- Keep `Backend/.env` private; use `.env.example` only as a template.
- SQLite databases and session files are generated locally and ignored by Git.
- Do not use test or seeded credentials in a deployed environment.
- The `Sample Site/` directory is intentionally an insecure reference and
  should not be used as the production implementation.
