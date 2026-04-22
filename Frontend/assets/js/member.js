(() => {
  const messageEl = document.getElementById('member-message');
  const errorEl = document.getElementById('member-error');
  const tableBody = document.getElementById('member-orders-body');
  const emptyEl = document.getElementById('member-orders-empty');

  const esc = (v) =>
    String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  function showMessage(text, isError = false) {
    const target = isError ? errorEl : messageEl;
    const clear = isError ? messageEl : errorEl;
    if (clear) {
      clear.hidden = true;
      clear.textContent = '';
    }
    if (!target) return;
    target.hidden = false;
    target.textContent = text;
  }

  function formatMoney(cents, currency = 'HKD') {
    const amount = Number(cents) / 100;
    if (!Number.isFinite(amount)) return `${currency} 0.00`;
    return `${currency} ${amount.toFixed(2)}`;
  }

  function formatTime(ts) {
    const parsed = Number(ts);
    if (!Number.isFinite(parsed) || parsed < 1) return '-';
    return new Date(parsed).toLocaleString();
  }

  function renderOrders(orders) {
    if (!tableBody || !emptyEl) return;

    if (!Array.isArray(orders) || orders.length === 0) {
      tableBody.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }

    const rows = orders.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const itemText = items.length
        ? items.map((item) => `${esc(item.product_name)} x${esc(item.quantity)}`).join(', ')
        : '-';

      return `<tr>
        <td>#${esc(order.orderid)}</td>
        <td>${esc(order.status)}</td>
        <td>${esc(formatMoney(order.total_amount_cents, order.currency))}</td>
        <td>${itemText}</td>
        <td>${esc(formatTime(order.created_at))}</td>
        <td>${esc(formatTime(order.paid_at))}</td>
      </tr>`;
    });

    tableBody.innerHTML = rows.join('');
    emptyEl.hidden = true;
  }

  async function ensureAuthenticated() {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.authenticated) {
      window.location.href = 'login.html';
      return false;
    }

    return true;
  }

  async function loadRecentOrders() {
    const response = await fetch('/api/orders/recent', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Unable to load your recent orders.');
    }
    return payload.orders || [];
  }

  async function init() {
    try {
      const authenticated = await ensureAuthenticated();
      if (!authenticated) return;

      const orders = await loadRecentOrders();
      renderOrders(orders);
      showMessage('Loaded your most recent orders.');
    } catch (err) {
      showMessage(err.message || 'Unable to load member portal.', true);
    }
  }

  init();
})();
