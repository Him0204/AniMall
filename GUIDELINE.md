# AniMall Phase 3 + VS Code Guideline

This guide helps you run the **connected Frontend + Backend** setup and work on Phase 3 cart logic in VS Code.

## 1) Open workspace in VS Code
- Open folder: `/workspace/IERG4210`
- Recommended extensions:
  - ESLint
  - Prettier
  - SQLite Viewer (optional for checking DB)

## 2) Environment setup
Create `Backend/.env` (or copy from `.env.example`):

```env
PORT=80
DB_PATH=./db/animall.sqlite
UPLOAD_DIR=../Frontend/Ref/assets/uploads
```

## 3) Install and migrate DB (demo data)
From VS Code terminal:

```bash
cd Backend
npm install
npm run migrate-db
```

`migrate-db` recreates schema and seeds demo categories/products.

## 4) Start app
```bash
cd Backend
npm start
```

## 5) Verify connected app
- Home: `http://localhost/`
- Category: `http://localhost/category.html?catid=1`
- Product: `http://localhost/product.html?pid=1`
- Admin: `http://localhost/admin`
- API health: `http://localhost/api/health`

## 6) Phase 3 cart behavior checklist
- Add-to-cart from list and product page works.
- Cart data persists in `localStorage`.
- Quantity changes update subtotal instantly.
- Remove item works.
- Cart count badge updates globally.

## 7) Where code lives
- Backend server/API: `Backend/server.js`
- DB migration/seed: `Backend/db/migrate.js`
- Frontend cart logic: `Frontend/Ref/assets/js/cart.js`
- Frontend page data loading:
  - `Frontend/Ref/assets/js/index.js`
  - `Frontend/Ref/assets/js/product.js`

## 8) Debug tips in VS Code
- Use `JavaScript Debug Terminal` to run `npm start`.
- Set breakpoints in `Backend/server.js` routes.
- In browser dev tools:
  - Check `Application -> Local Storage` for `animall_cart_v1`.
  - Check Network tab for `/api/categories`, `/api/products`, `/api/product/:pid`.
