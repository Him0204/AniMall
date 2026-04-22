
**This is NOT a "solution" for the Project.** It just shows you an example that could satisfy like at most **60%** of the basic requirements. **If you have already built yours website, you don't need to change it; BUT instead, try to find vulnerabilities in this code**

*In case you are lagging behind (e.g., stuck in early phases), you may start with this sample code.* BUT you **MUST make many modifications** to the codes, e.g., changing the styles, layout, optimizing backend logics, adding security practices, etc. And **indicate in your final report** that you have used the "sample code".

## Minimal (In)secure shopping cart website using plain HTML/CSS/JS frontend and Node.js + Express backend.

**This code is generated with the help of AI Tool.**

## Features
- Product list by category
- Product detail page
- LocalStorage cart drawer with totals
- User register/login
- Admin-only product/category/order management
- Image upload for products/categories
- Checkout creates orders in database
- Stripe-ready checkout session endpoint

## Setup
1. Copy `.env.example` to `.env`
    - Read what are stored, and change according to your site
2. Run `npm install`
3. Run `npm run dev`
    - or use `pm2` to `start server.js`


## Default admin
- Email: `admin@shop.com`
- Password: `Admin@1234`


## Known Issues / to be fixed

- JWT is used, which is NOT RECOMMENDED (if you use this codebase, you must switch to `express-session`)
- No/Minimal CSRF protection
- Extra setup in cloud, e.g., nginx config, FS permissions
- User order management is not implemented, e.g., they cannot view orders, continue the previously failed payment, etc.
- Shopping cart is not cleared after submitting order
- (Many) other issues
