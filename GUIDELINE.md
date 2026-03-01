# AniMall Guideline (Phase 1 → Phase 3 Alignment)

This file is the **single alignment checklist + implementation guide** for CUHK IERG4210 AniMall across:
- **Phase 1**: semantic static frontend and layout requirements
- **Phase 2A/2B**: Node.js + SQLite backend, admin CRUD, secure upload + resize, DB-driven pages
- **Phase 3**: localStorage cart behavior on frontend

---

## 0) Tech + Architecture Baseline

- Backend: **Node.js + Express + SQLite only**.
- DB: SQLite (`Backend/db/animall.sqlite` by default).
- Frontend: static files served by backend from `Frontend/Ref`.
- Images:
  - Static seed assets: `Frontend/Ref/assets/img`
  - Uploaded/resized assets: `Frontend/Ref/assets/uploads`

### Directory map
- `Backend/server.js` — API + Admin + upload/resize logic + static serving
- `Backend/db/migrate.js` — migration + demo seed (schema recreation)
- `Backend/db/init.js` — alias/duplicate migration entrypoint
- `Backend/package.json` — scripts (`migrate-db`, `init-db`, `start`)
- `Frontend/Ref/index.html` — home/product listing page
- `Frontend/Ref/category.html` — category listing page
- `Frontend/Ref/product.html` — product detail page
- `Frontend/Ref/assets/js/index.js` — category + product listing fetch/render
- `Frontend/Ref/assets/js/product.js` — product detail fetch/render
- `Frontend/Ref/assets/js/cart.js` — Phase 3 cart localStorage logic
- `Frontend/Ref/assets/css/style.css` — all styling (no inline style)

---

## 1) Phase 1 Alignment (Frontend Structure/Style)

## 1.1 Required HTML/CSS principles
- Use **semantic HTML** (`header`, `nav`, `main`, `section`, `article`, `footer`, etc.).
- **No inline CSS** and no presentational HTML attributes (`style=`, `align=`).
- Keep styling in `Frontend/Ref/assets/css/style.css` only.

## 1.2 Product list card requirements (home/category)
Each product card must show:
- thumbnail
- product name
- price
- add-to-cart button

Thumbnail and name must link to detail page with query string:
- `/product.html?pid=<id>`

## 1.3 Breadcrumb requirement
Both listing/detail pages include breadcrumb nav:
- Home / Category / Product hierarchy

## 1.4 Cart UI panel requirement
- Floating cart button + drawer is present and visually consistent.
- In Phase 1/2 it may be static.
- In Phase 3 it becomes interactive with localStorage.

---

## 2) Phase 2A/2B Alignment (Backend + DB + Security)

## 2.1 Security baseline
- Disable version leakage: `app.disable('x-powered-by')`.
- Hide internals from users: no stack traces in responses.
- Apply request size limits (`express.json`, `express.urlencoded`).
- Use parameterized SQL only.
- Validate all user inputs server-side.
- Keep dependencies minimal (`express`, `sqlite3`, `multer`, `sharp`, optional `helmet`).

## 2.2 DB schema requirements
`categories`
- `catid INTEGER PRIMARY KEY`
- `name TEXT NOT NULL`

`products`
- `pid INTEGER PRIMARY KEY`
- `catid INTEGER NOT NULL REFERENCES categories(catid)`
- `name TEXT NOT NULL`
- `price REAL NOT NULL CHECK(price >= 0)`
- `description TEXT`
- `image_large TEXT`
- `image_thumb TEXT`

Must enable FK:
- `PRAGMA foreign_keys = ON`

## 2.3 Migration/seed requirement
Use migration script to recreate schema and seed demo rows:
```bash
cd Backend
npm run migrate-db
```

`init-db` is kept as compatibility alias.

## 2.4 Admin CRUD requirements
Provide admin panel (`/admin`) with HTML forms for:
- Category create/update/delete
- Product create/update/delete

Product forms include:
- category dropdown (DB-driven)
- name
- price
- description
- image file input

## 2.5 Upload + resize requirements
- Allowed formats: `.jpg`, `.jpeg`, `.png`
- Max size: 10MB
- Validate **MIME + extension**
- Do not trust user file names
- Save filename with pid basis:
  - `pid_<pid>_large.jpg`
  - `pid_<pid>_thumb.jpg`
- Resize with sharp:
  - large width about 900
  - thumb width about 300
- Store safe relative DB paths

## 2.6 DB-driven frontend requirements
Home/category/product pages fetch data via backend API:
- `GET /api/categories`
- `GET /api/products?catid=<id>`
- `GET /api/product/<pid>`

URL expectations:
- category selected in URL query: `?catid=<id>`
- product detail query: `?pid=<id>`

---

## 3) Phase 3 Alignment (Cart Behavior)

Cart logic lives in `Frontend/Ref/assets/js/cart.js` using key:
- `animall_cart_v1`

Required behaviors:
- Add to cart from listing page cards.
- Add to cart from product detail page.
- Persist cart in localStorage.
- Render cart drawer items on all pages.
- Quantity update changes subtotal instantly.
- Remove button deletes item.
- Cart badge count updates globally.

Data format example:
```json
[
  {
    "pid": 1,
    "name": "Premium Dog Collar",
    "price": 198,
    "image": "assets/img/img001.webp",
    "qty": 2
  }
]
```

---

## 4) Setup/Run (End-to-end)

## 4.1 Environment
Create `Backend/.env`:
```env
PORT=80
DB_PATH=./db/animall.sqlite
UPLOAD_DIR=../Frontend/Ref/assets/uploads
```

## 4.2 Install + migrate + start
```bash
cd Backend
npm install
npm run migrate-db
npm start
```

## 4.3 URLs
- Home: `http://localhost/`
- Category: `http://localhost/category.html?catid=1`
- Product: `http://localhost/product.html?pid=1`
- Admin: `http://localhost/admin`
- Health: `http://localhost/api/health`

---

## 5) VS Code Guideline

## 5.1 Recommended extensions
- ESLint
- Prettier
- SQLite Viewer (optional)

## 5.2 Debug flow
- Run backend in VS Code terminal: `npm start`
- Set breakpoints in `Backend/server.js`
- Use browser DevTools:
  - Network: verify `/api/*` calls
  - Application > Local Storage: verify `animall_cart_v1`

## 5.3 Quick acceptance checklist
- [ ] No inline CSS/align attributes in frontend HTML
- [ ] Category/product pages load data from API
- [ ] Breadcrumb links are valid
- [ ] Admin category/product CRUD works
- [ ] Upload rejects invalid type/oversize
- [ ] Upload produces large+thumb files with pid naming
- [ ] Cart add/update/remove/persist works across refresh

---

## 6) Submission/Review Notes

When preparing review/demo:
- Keep one canonical frontend at `Frontend/Ref`.
- Avoid duplicate legacy frontend directories/assets.
- Use migration script to regenerate consistent demo data.
- Keep this file (`GUIDELINE.md`) updated whenever requirement interpretation changes.
