const Cart = (() => {
  const KEY = 'animall_cart';

  /* ---- helpers ---- */
  const esc = (v) =>
    String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
  }

  function save(cart) {
    localStorage.setItem(KEY, JSON.stringify(cart));
  }

  /* ---- badge ---- */
  function updateBadge() {
    const cart = load();
    const total = Object.values(cart).reduce((s, q) => s + q, 0);
    const badge = document.querySelector('.cart-count');
    if (!badge) return;
    badge.textContent = total;
    badge.setAttribute('aria-label', `${total} item${total !== 1 ? 's' : ''} in cart`);
    badge.classList.toggle('cart-count--active', total > 0);
  }

  /* ---- public API ---- */
  function add(pid) {
    pid = String(pid);
    const cart = load();
    cart[pid] = (cart[pid] || 0) + 1;
    save(cart);
    render();
  }

  function update(pid, qty) {
    pid = String(pid);
    const cart = load();
    if (qty <= 0) delete cart[pid];
    else cart[pid] = qty;
    save(cart);
    render();
  }

  function remove(pid) {
    update(String(pid), 0);
  }

  /* ---- render cart drawer ---- */
  async function render() {
    updateBadge();

    const contentEl = document.querySelector('.cart-content');
    const subtotalEl = document.querySelector('.cart-subtotal-value');
    if (!contentEl) return;

    const cart = load();
    const pids = Object.keys(cart);

    if (!pids.length) {
      contentEl.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      if (subtotalEl) subtotalEl.textContent = 'HK$0.00';
      return;
    }

    contentEl.innerHTML = '<p class="cart-loading">Loading…</p>';

    const products = await Promise.all(
      pids.map((pid) =>
        fetch(`/api/product/${encodeURIComponent(pid)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    let total = 0;
    const rows = pids.map((pid, i) => {
      const p = products[i];
      if (!p) return '';
      const qty = cart[pid];
      total += Number(p.price) * qty;

      return `<div class="cart-item" data-pid="${esc(pid)}">
        <div class="cart-item-img">
          ${p.image_thumb
            ? `<img src="${esc(p.image_thumb)}" alt="${esc(p.name)}">`
            : `<img src="${esc(p.image_large || 'assets/img/img001.webp')}" alt="${esc(p.name)}">`}
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(p.name)}</div>
          <div class="cart-item-price">HK$${Number(p.price).toFixed(2)}</div>
          <div class="cart-item-controls">
            <button class="cart-qty-btn" type="button"
              data-action="dec" data-pid="${esc(pid)}"
              aria-label="Decrease quantity of ${esc(p.name)}">−</button>
            <span class="cart-qty-val" aria-label="Quantity">${qty}</span>
            <button class="cart-qty-btn" type="button"
              data-action="inc" data-pid="${esc(pid)}"
              aria-label="Increase quantity of ${esc(p.name)}">+</button>
            <button class="cart-remove-btn" type="button"
              data-pid="${esc(pid)}"
              aria-label="Remove ${esc(p.name)} from cart">✕</button>
          </div>
        </div>
      </div>`;
    }).filter(Boolean);

    contentEl.innerHTML = rows.join('') || '<p class="cart-empty">Your cart is empty.</p>';
    if (subtotalEl) subtotalEl.textContent = `HK$${total.toFixed(2)}`;
    if (!rows.filter(Boolean).length && subtotalEl) subtotalEl.textContent = 'HK$0.00';
  }

  /* ---- event delegation ---- */
  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.product-add-btn[data-pid]');
    if (addBtn) {
      add(addBtn.dataset.pid);

      const orig = addBtn.textContent;
      addBtn.textContent = 'Added!';
      addBtn.disabled = true;
      setTimeout(() => { addBtn.textContent = orig; addBtn.disabled = false; }, 900);
      return;
    }

    const qtyBtn = e.target.closest('.cart-qty-btn');
    if (qtyBtn) {
      const pid = qtyBtn.dataset.pid;
      const cart = load();
      const qty = cart[pid] || 0;
      if (qtyBtn.dataset.action === 'inc') update(pid, qty + 1);
      else update(pid, qty - 1);
      return;
    }

    const removeBtn = e.target.closest('.cart-remove-btn');
    if (removeBtn) {
      remove(removeBtn.dataset.pid);
    }
  });

  /* ---- restore cart on every page load ---- */
  render();

  return { add, update, remove, render };
})();
