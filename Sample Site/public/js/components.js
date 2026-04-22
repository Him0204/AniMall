function buildNav() {
  const user = Auth.getUser();
  const adminLink = user?.role === 'admin' ? '<li><a href="/admin/">Admin Panel</a></li>' : '';
  const authPart = user
    ? `<span class="nav-username">Hi, ${user.username}</span><button id="logoutBtn" class="btn-link">Logout</button>`
    : `<a href="/login.html" class="btn-link">Login</a><a href="/register.html" class="btn-primary btn-sm">Register</a>`;
  return `
    <nav class="site-nav">
      <div class="nav-inner">
        <a href="/" class="nav-logo">ShopSecure</a>
        <ul class="nav-links">
          <li><a href="/">Shop</a></li>
          ${adminLink}
        </ul>
        <div class="nav-actions">
          ${authPart}
          <button id="cartToggleBtn" class="cart-icon-btn" aria-label="Open cart">
            Cart <span data-cart-count class="cart-badge hidden">0</span>
          </button>
        </div>
      </div>
    </nav>
    <div id="cartOverlay" class="cart-overlay hidden"></div>
    <aside id="cartDrawer" class="cart-drawer">
      <div class="cart-drawer-header"><h2>Shopping Cart</h2><button id="closeCartBtn" class="cart-close-btn">✕</button></div>
      <div id="cartItemsContainer" class="cart-items-container"></div>
      <div class="cart-drawer-footer">
        <div class="cart-summary-row"><span>Subtotal</span><span data-cart-subtotal>$0.00</span></div>
        <div class="cart-summary-row"><span>Tax</span><span data-cart-tax>$0.00</span></div>
        <div class="cart-summary-row cart-total-row"><span>Total</span><span data-cart-total>$0.00</span></div>
        <a href="/checkout.html" class="btn-primary btn-block">Checkout</a>
        <button id="clearCartBtn" class="btn-link btn-danger-link">Clear Cart</button>
      </div>
    </aside>`;
}

function initComponents() {
  const nav = document.getElementById('navContainer');
  if (nav) nav.innerHTML = buildNav();
  Cart.refreshUI();

  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  const itemsContainer = document.getElementById('cartItemsContainer');

  const open = () => {
    drawer?.classList.add('cart-drawer--open');
    overlay?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    Cart.renderItems(itemsContainer);
    Cart.refreshUI();
  };
  const close = () => {
    drawer?.classList.remove('cart-drawer--open');
    overlay?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  };

  document.getElementById('cartToggleBtn')?.addEventListener('click', open);
  document.getElementById('closeCartBtn')?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.getElementById('clearCartBtn')?.addEventListener('click', () => { Cart.clear(); Cart.renderItems(itemsContainer); });
  document.getElementById('logoutBtn')?.addEventListener('click', () => { Auth.clearSession(); location.href = '/login.html'; });
  window.addEventListener('cartUpdated', () => { Cart.refreshUI(); if (drawer?.classList.contains('cart-drawer--open')) Cart.renderItems(itemsContainer); });
}

window.initComponents = initComponents;
