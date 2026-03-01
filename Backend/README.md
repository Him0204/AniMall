# AniMall Phase 2B

## Install
```bash
cd Backend
npm install
```

## Run DB migration (schema + demo data seed)
```bash
npm run migrate-db
```

(`npm run init-db` is kept as an alias to `migrate-db`.)

## Start backend (serves frontend too)
```bash
npm start
```

## Connected frontend + backend URLs
- Home page (dynamic categories/products): `http://localhost/`
- Category page (same dynamic listing): `http://localhost/category.html?catid=1`
- Product detail page: `http://localhost/product.html?pid=1`
- Admin panel: `http://localhost/admin`
- Health/API check: `http://localhost/api/health`

## Quick demo verification
1. Run migration: `npm run migrate-db`.
2. Start server: `npm start`.
3. Open `/` and switch categories; product list should change from DB rows.
4. Open `/product.html?pid=1`; details should come from DB.
5. Open `/admin`; create/update/delete category/product and confirm frontend reflects changes.
6. Upload JPG/PNG <=10MB for a product in `/admin`; generated files should appear as:
   - `Frontend/Ref/assets/uploads/pid_<id>_large.jpg`
   - `Frontend/Ref/assets/uploads/pid_<id>_thumb.jpg`
