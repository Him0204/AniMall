(() => {
  const CART_KEY = 'animall_cart';

  const messageEl = document.getElementById('checkout-message');
  const errorEl = document.getElementById('checkout-error');
  const modeTitleEl = document.getElementById('checkout-mode-title');
  const modeNoteEl = document.getElementById('checkout-mode-note');
  const tableBody = document.getElementById('checkout-items-body');
  const emptyEl = document.getElementById('checkout-empty');
  const subtotalEl = document.getElementById('checkout-subtotal');
  const payBtn = document.getElementById('checkout-pay-btn');

  const params = new URLSearchParams(window.location.search);
  const resultParam = String(params.get('result') || '').toLowerCase();

  let csrfToken = '';
  const state = {
    mode: 'cart',
    orderId: null,
    orderStatus: null,
    currency: 'HKD',
    items: []
  };

  const esc = (v) =>
    String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  function toPositiveInt(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isInteger(parsed) || parsed < 1) return null;
    return parsed;
  }

  function formatMoney(cents, currency = 'HKD') {
    const amount = Number(cents) / 100;
    if (!Number.isFinite(amount)) return `${currency} 0.00`;
    return `${currency} ${amount.toFixed(2)}`;
  }

  function clearMessages() {
    if (messageEl) {
      messageEl.hidden = true;
      messageEl.textContent = '';
    }
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function showMessage(text, isError = false) {
    clearMessages();
    const target = isError ? errorEl : messageEl;
    if (!target) return;
    target.hidden = false;
    target.textContent = text;
  }

  function getCurrentRelativeUrl() {
    const filename = window.location.pathname.split('/').filter(Boolean).pop() || 'checkout.html';
    return `${filename}${window.location.search}`;
  }

  function redirectToLogin() {
    const next = encodeURIComponent(getCurrentRelativeUrl());
    window.location.href = `login.html?next=${next}`;
  }

  function loadCartObject() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveCartObject(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function normalizeCartItems(cart) {
    return Object.entries(cart)
      .map(([pid, quantity]) => ({
        pid: toPositiveInt(pid),
        quantity: toPositiveInt(quantity)
      }))
      .filter((item) => item.pid && item.quantity)
      .sort((a, b) => a.pid - b.pid);
  }

  function mapToCheckoutItems(productsByPid, normalizedItems) {
    return normalizedItems
      .map((item) => {
        const product = productsByPid.get(item.pid);
        if (!product) return null;
        const unitPriceCents = Math.round(Number(product.price) * 100);
        if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) return null;
        return {
          pid: item.pid,
          product_name: String(product.name || 'Product'),
          quantity: item.quantity,
          unit_price_cents: unitPriceCents,
          line_total_cents: unitPriceCents * item.quantity
        };
      })
      .filter(Boolean);
  }

  async function fetchProductsByPid(normalizedItems) {
    const productEntries = await Promise.all(
      normalizedItems.map(async (item) => {
        const response = await fetch(`/api/product/${encodeURIComponent(String(item.pid))}`, { credentials: 'same-origin' });
        if (!response.ok) return [item.pid, null];
        const payload = await response.json().catch(() => null);
        return [item.pid, payload];
      })
    );

    return new Map(productEntries);
  }

  function renderRows() {
    if (!tableBody || !emptyEl || !subtotalEl || !payBtn) return;

    if (!state.items.length) {
      tableBody.innerHTML = '';
      emptyEl.hidden = false;
      subtotalEl.textContent = formatMoney(0, state.currency);
      payBtn.disabled = true;
      return;
    }

    const totalCents = state.items.reduce((sum, item) => sum + Number(item.line_total_cents || 0), 0);

    const rows = state.items.map((item) => {
      if (state.mode === 'pending') {
        return `<tr>
          <td>${esc(item.product_name)}</td>
          <td>${esc(formatMoney(item.unit_price_cents, state.currency))}</td>
          <td>${esc(item.quantity)}</td>
          <td>${esc(formatMoney(item.line_total_cents, state.currency))}</td>
          <td>-</td>
        </tr>`;
      }

      return `<tr>
        <td>${esc(item.product_name)}</td>
        <td>${esc(formatMoney(item.unit_price_cents, state.currency))}</td>
        <td>
          <div class="checkout-qty-controls">
            <button type="button" class="checkout-qty-btn" data-action="dec" data-pid="${esc(item.pid)}" aria-label="Decrease quantity">-</button>
            <span class="checkout-qty-val">${esc(item.quantity)}</span>
            <button type="button" class="checkout-qty-btn" data-action="inc" data-pid="${esc(item.pid)}" aria-label="Increase quantity">+</button>
          </div>
        </td>
        <td>${esc(formatMoney(item.line_total_cents, state.currency))}</td>
        <td>
          <button type="button" class="checkout-remove-btn" data-pid="${esc(item.pid)}">Remove</button>
        </td>
      </tr>`;
    });

    tableBody.innerHTML = rows.join('');
    emptyEl.hidden = true;
    subtotalEl.textContent = formatMoney(totalCents, state.currency);

    if (state.mode === 'pending') {
      const canContinue = String(state.orderStatus || '').toLowerCase() === 'pending';
      payBtn.disabled = !canContinue;
      payBtn.textContent = canContinue ? 'Continue Payment in Stripe' : 'Payment Not Available';
      return;
    }

    payBtn.disabled = false;
    payBtn.textContent = 'Proceed to Stripe';
  }

  async function syncDrawer() {
    if (typeof Cart !== 'undefined' && Cart && typeof Cart.render === 'function') {
      await Cart.render();
    }
  }

  async function loadCartMode() {
    state.mode = 'cart';
    state.orderId = null;
    state.orderStatus = null;
    state.currency = 'HKD';

    if (modeTitleEl) modeTitleEl.textContent = 'Review Cart';
    if (modeNoteEl) modeNoteEl.textContent = 'Edit item quantities before continuing to Stripe payment.';

    const cart = loadCartObject();
    const normalizedItems = normalizeCartItems(cart);

    if (!normalizedItems.length) {
      state.items = [];
      renderRows();
      return;
    }

    const productsByPid = await fetchProductsByPid(normalizedItems);

    let removedMissingProduct = false;
    normalizedItems.forEach((item) => {
      if (!productsByPid.get(item.pid)) {
        delete cart[item.pid];
        removedMissingProduct = true;
      }
    });

    if (removedMissingProduct) {
      saveCartObject(cart);
    }

    state.items = mapToCheckoutItems(productsByPid, normalizeCartItems(cart));
    renderRows();
  }

  async function loadPendingMode(orderId) {
    state.mode = 'pending';
    state.orderId = orderId;

    if (modeTitleEl) modeTitleEl.textContent = `Pending Order #${orderId}`;
    if (modeNoteEl) modeNoteEl.textContent = 'This pending order snapshot is locked. Continue payment with Stripe.';

    const response = await fetch(`/api/orders/${encodeURIComponent(String(orderId))}`, { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success || !payload.order) {
      throw new Error(payload.error || 'Unable to load pending order.');
    }

    const order = payload.order;
    state.orderStatus = order.status;
    state.currency = String(order.currency || 'HKD').toUpperCase();
    state.items = Array.isArray(order.items)
      ? order.items.map((item) => ({
        pid: toPositiveInt(item.pid),
        product_name: String(item.product_name || 'Product'),
        quantity: toPositiveInt(item.quantity) || 1,
        unit_price_cents: Number.parseInt(String(item.unit_price_cents || 0), 10) || 0,
        line_total_cents: Number.parseInt(String(item.line_total_cents || 0), 10) || 0
      }))
      : [];

    renderRows();

    if (resultParam === 'success') {
      if (String(order.status || '').toLowerCase() === 'paid') {
        showMessage(`Payment completed successfully for order #${orderId}.`);
      } else {
        showMessage(`Payment was submitted for order #${orderId}. Status is currently ${order.status}.`);
      }
    } else if (resultParam === 'cancel') {
      showMessage(`Payment was canceled for order #${orderId}. You can continue payment below.`);
    } else if (String(order.status || '').toLowerCase() !== 'pending') {
      showMessage(`Order #${orderId} is ${order.status}. Continuing payment is disabled.`);
    }
  }

  async function startCartCheckout() {
    if (!payBtn) return;

    const cartItems = normalizeCartItems(loadCartObject());
    if (!cartItems.length) {
      showMessage('Your cart is empty.', true);
      await loadCartMode();
      await syncDrawer();
      return;
    }

    const originalText = payBtn.textContent;
    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        credentials: 'same-origin',
        body: JSON.stringify({ items: cartItems })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.checkoutUrl) {
        throw new Error(payload.error || 'Unable to start checkout.');
      }

      saveCartObject({});
      await syncDrawer();
      window.location.href = payload.checkoutUrl;
    } catch (err) {
      showMessage(err.message || 'Unable to start checkout.', true);
      payBtn.disabled = false;
      payBtn.textContent = originalText;
    }
  }

  async function continuePendingCheckout() {
    if (!payBtn || !state.orderId) return;

    const originalText = payBtn.textContent;
    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(String(state.orderId))}/checkout-session`, {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken
        },
        credentials: 'same-origin'
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.checkoutUrl) {
        throw new Error(payload.error || 'Unable to continue payment.');
      }

      window.location.href = payload.checkoutUrl;
    } catch (err) {
      showMessage(err.message || 'Unable to continue payment.', true);
      payBtn.disabled = false;
      payBtn.textContent = originalText;
    }
  }

  async function ensureAuthenticated() {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.authenticated) {
      redirectToLogin();
      return false;
    }

    csrfToken = String(payload.csrfToken || '');
    return true;
  }

  async function handleTableActions(event) {
    if (state.mode !== 'cart') return;

    const qtyBtn = event.target.closest('.checkout-qty-btn');
    if (qtyBtn) {
      const pid = toPositiveInt(qtyBtn.getAttribute('data-pid'));
      if (!pid) return;

      const cart = loadCartObject();
      const currentQty = toPositiveInt(cart[pid]) || 0;
      const nextQty = qtyBtn.getAttribute('data-action') === 'inc' ? currentQty + 1 : currentQty - 1;

      if (nextQty <= 0) {
        delete cart[pid];
      } else {
        cart[pid] = nextQty;
      }

      saveCartObject(cart);
      await loadCartMode();
      await syncDrawer();
      return;
    }

    const removeBtn = event.target.closest('.checkout-remove-btn');
    if (removeBtn) {
      const pid = toPositiveInt(removeBtn.getAttribute('data-pid'));
      if (!pid) return;

      const cart = loadCartObject();
      delete cart[pid];
      saveCartObject(cart);
      await loadCartMode();
      await syncDrawer();
    }
  }

  async function init() {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) return;

    clearMessages();

    const orderId = toPositiveInt(params.get('orderId'));
    if (orderId) {
      try {
        await loadPendingMode(orderId);
      } catch (err) {
        showMessage(err.message || 'Unable to load pending order.', true);
      }
    } else {
      if (resultParam === 'success') {
        showMessage('Payment completed successfully.');
      } else if (resultParam === 'cancel') {
        showMessage('Payment was canceled.');
      }
      await loadCartMode();
    }

    if (tableBody) {
      tableBody.addEventListener('click', (event) => {
        handleTableActions(event).catch((err) => {
          showMessage(err.message || 'Unable to update checkout items.', true);
        });
      });
    }

    if (payBtn) {
      payBtn.addEventListener('click', () => {
        if (state.mode === 'pending') {
          continuePendingCheckout().catch((err) => {
            showMessage(err.message || 'Unable to continue payment.', true);
          });
        } else {
          startCartCheckout().catch((err) => {
            showMessage(err.message || 'Unable to start checkout.', true);
          });
        }
      });
    }

    await syncDrawer();
  }

  init().catch((err) => {
    showMessage(err.message || 'Unable to load checkout page.', true);
  });
})();
