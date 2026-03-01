---
description: Load these instructions whenever working on the IERG4210 AniMall e-commerce project (any phase), including code generation, modification, review, refactoring, backend setup, database design, security configuration, or frontend implementation.
applyTo: "**/*.{html,css,js,mjs,cjs,ts,sql,json,md,sh,yml,yaml}"
---

# IERG4210 AniMall Project Context & Coding Guidelines

You are assisting in building an academic e-commerce website project for:

IERG4210 – Web Programming & Security (2025-26 Term 2)

The project must strictly follow assignment marking requirements for:

- Phase 1 – Layout
- Phase 2A – Secure Server Setup
- Phase 2B – Data Presentation & Management
- Phase 3 – AJAX Shopping List

The system must prioritize:
- Security
- Clean architecture
- Rubric compliance
- Maintainability
- Proper separation of concerns

If any requested change violates marking requirements, explain the conflict before proceeding.

---

# GLOBAL DEVELOPMENT PRINCIPLES

## 1. Security First (Mandatory)

Always:

- Use prepared statements for SQL
- Validate and sanitize all inputs
- Restrict file uploads (type + size ≤ 10MB)
- Prevent SQL injection
- Prevent XSS
- Prevent path traversal
- Disable directory listing
- Hide server version headers
- Do NOT expose stack traces to users
- Do NOT hardcode secrets in source code
- Do NOT commit credentials

If generating backend code, default to secure implementation.

---

## 2. Separation of Concerns

Strictly enforce:

| Layer | Responsibility |
|--------|---------------|
| HTML | Structure only |
| CSS | Styling only |
| JS | Client-side logic only |
| Node | API & business logic |
| SQL | Data persistence |

Never mix styling inside HTML.
Never mix SQL directly inside route handlers without abstraction.
Never mix business logic inside frontend.

---

# PHASE 1 CONSTRAINTS – LAYOUT ONLY

JavaScript is NOT required in Phase 1.

Must include:

- Semantic HTML (`header`, `nav`, `section`, `footer`, `ul`, `li`)
- No inline CSS
- CSS tableless layout (Flexbox or Grid)
- Product list:
  - Thumbnail
  - Name
  - Price
  - addToCart button
- Hover shopping cart overlay
- Cart visible on both main and product page
- Hierarchical navigation (Home > Category > Product)

Phase 1 is dummy only.
No backend.
No real purchasing.

If modifying Phase 1 files, do NOT introduce backend logic.

---

# PHASE 2A CONSTRAINTS – SECURE SERVER SETUP

Environment:

- Linux VM
- Nginx or Apache
- Node.js
- SQLite
- MySQL NOT allowed

Firewall:

- Allow only 22, 80, 443
- Block all others

Server hardening:

- Hide server version headers
- Disable directory index
- Disable error stack output
- Apply regular updates

When generating config:
- Use minimal attack surface
- No unnecessary services

---

# PHASE 2B CONSTRAINTS – DATABASE & ADMIN

Database schema must include:

## categories
- catid (PK)
- name
- Minimum 2 categories

## products
- pid (PK)
- catid
- name
- price
- description
- Minimum 2 products per category

Admin panel must support:
- Insert
- Update
- Delete

File upload:
- Max 10MB
- Secure file type check
- Store filename based on product ID
- Automatically resize:
  - Thumbnail
  - Large image

Main page:
- Categories loaded from DB
- Products filtered by catid
- catid reflected in query string

Product page:
- Fetch product by pid
- Render dynamically from DB

---

# PHASE 3 CONSTRAINTS – AJAX SHOPPING CART

Critical rule:
All cart operations must occur WITHOUT page reload.

Cart must:

- Work on both main and product page
- Prevent duplicate rows (same product only once)
- Allow quantity update
- Allow removal
- Store in localStorage:
  {
    pid: quantity
  }
- Fetch product name & price from backend via AJAX
- Calculate total on client side
- Restore cart after reload

No hardcoded product information allowed in cart.

---

# IMAGE PROCESSING REQUIREMENTS

When uploading images:

- Validate MIME type
- Validate extension
- Resize automatically
- Store:
  - thumbnail version
  - large version
- Main page uses thumbnail
- Product page uses large image

---

# SUBMISSION RULES

Must include:

- package.json
- server code
- database file OR SQL script
- web server config
- no node_modules
- no secrets

System must be reproducible from submitted source.

---

# CODE GENERATION RULES

When generating code:

1. Default to secure implementation.
2. Use modular architecture.
3. Use async/await.
4. Handle errors safely.
5. Do not expose internal errors.
6. Follow RESTful principles for API design.
7. Write clean, readable, production-style code.

If unsure, choose the most secure and rubric-compliant approach.

---

# REVIEW RULES

When reviewing code:

- Identify rubric violations
- Identify security vulnerabilities
- Identify architectural violations
- Suggest best-practice improvements
- Point out potential marking deductions

Be strict as an assignment marker.

---

# PRIORITY ORDER

1. Security
2. Marking compliance
3. Correct functionality
4. Clean architecture
5. Performance
6. Code elegance

Never sacrifice security or rubric compliance for convenience.

---

End of project AI context.