# AniMall Phase 2B

## Install
```bash
cd Backend
npm install
```

## Initialize DB
```bash
npm run init-db
```

## Start server
```bash
npm start
```

## URLs
- Main page: `http://localhost/`
- Product page example: `http://localhost/product.html?pid=1`
- Admin panel: `http://localhost/admin`

## Upload and resize verification
1. Open `/admin`, create or update a product with a JPG/PNG image <=10MB.
2. Check generated files in `Frontend/Ref/assets/uploads` as `pid_<id>_large.jpg` and `pid_<id>_thumb.jpg`.
3. Open `/` and `/product.html?pid=<id>` to confirm thumbnail and large image are used.
