(() => {
  const STORAGE_KEY = 'animall_cart_v1';

  function getCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function normalizeQuantity(value) {
    const qty = Number.parseInt(value, 10);
    return Number.isInteger(qty) && qty > 0 ? qty : 1;
  }

  function sanitizeText(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderCart() {
    const cart = getCart();
    const countEl = document.querySelector('.cart-count');
    const listEl = document.getElementById('cart-items');
    const emptyEl = document.getElementById('cart-empty');
    const subtotalEl = document.getElementById('cart-subtotal-value');

    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    if (countEl) {
      countEl.textContent = String(totalQty);
      countEl.setAttribute('aria-label', `${totalQty} items in cart`);
    }

    if (subtotalEl) {
      subtotalEl.textContent = `HK$${subtotal.toFixed(2)}`;
    }

    if (!listEl || !emptyEl) {
      return;
    }

    if (!cart.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = cart.map((item) => `
      <li class="cart-item">
        <div class="cart-item-img">
          <img src="${sanitizeText(item.image || 'assets/img/img001.webp')}" alt="${sanitizeText(item.name)}">
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${sanitizeText(item.name)}</div>
          <div class="cart-item-price">HK$${Number(item.price).toFixed(2)}</div>
          <div class="cart-item-qty">
            <label for="cart-qty-${item.pid}">Qty:</label>
            <input class="js-cart-qty" id="cart-qty-${item.pid}" type="number" min="1" value="${item.qty}" data-pid="${item.pid}">
          </div>
          <button class="cart-remove-btn js-cart-remove" type="button" data-pid="${item.pid}">Remove</button>
        </div>
      </li>
    `).join('');
  }

  function addToCart(product) {
    const cart = getCart();
    const existing = cart.find((item) => item.pid === product.pid);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        pid: product.pid,
        name: product.name,
        price: Number(product.price),
        image: product.image,
        qty: 1
      });
    }
    saveCart(cart);
    renderCart();
  }

  function removeFromCart(pid) {
    const cart = getCart().filter((item) => item.pid !== pid);
    saveCart(cart);
    renderCart();
  }

  function updateQty(pid, qty) {
    const cart = getCart();
    const found = cart.find((item) => item.pid === pid);
    if (!found) return;
    found.qty = normalizeQuantity(qty);
    saveCart(cart);
    renderCart();
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const addBtn = event.target.closest('.js-add-to-cart');
      if (addBtn) {
        const pid = Number.parseInt(addBtn.dataset.pid || '', 10);
        const price = Number(addBtn.dataset.price || 0);
        if (!Number.isInteger(pid) || !Number.isFinite(price)) return;
        addToCart({
          pid,
          name: addBtn.dataset.name || 'Product',
          price,
          image: addBtn.dataset.image || 'assets/img/img001.webp'
        });
        return;
      }

      const removeBtn = event.target.closest('.js-cart-remove');
      if (removeBtn) {
        const pid = Number.parseInt(removeBtn.dataset.pid || '', 10);
        if (!Number.isInteger(pid)) return;
        removeFromCart(pid);
      }
    });

    document.addEventListener('change', (event) => {
      const qtyInput = event.target.closest('.js-cart-qty');
      if (!qtyInput) return;
      const pid = Number.parseInt(qtyInput.dataset.pid || '', 10);
      if (!Number.isInteger(pid)) return;
      updateQty(pid, qtyInput.value);
    });
  }

  window.AniMallCart = {
    refresh: renderCart,
    addToCart
  };

  bindEvents();
  renderCart();
})();
