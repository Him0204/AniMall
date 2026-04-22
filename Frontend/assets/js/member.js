(() => {
  const messageEl = document.getElementById('member-message');
  const errorEl = document.getElementById('member-error');
  const tableBody = document.getElementById('member-orders-body');
  const emptyEl = document.getElementById('member-orders-empty');

  let csrfToken = '';

  const esc = (v) =>
    String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

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

  function buildActionsCell(order) {
    if (String(order.status || '').toLowerCase() !== 'pending') {
      return '-';
    }

    const continueHref = `checkout.html?orderId=${encodeURIComponent(String(order.orderid))}`;
    return `<div class="member-order-actions">
      <a class="member-order-action member-order-continue" href="${continueHref}">Continue Payment</a>
      <button type="button" class="member-order-action member-order-cancel" data-order-id="${esc(order.orderid)}">Cancel</button>
    </div>`;
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
        <td>${buildActionsCell(order)}</td>
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

    csrfToken = String(payload.csrfToken || '');
    return true;
  }

  async function loadMemberOrders() {
    const response = await fetch('/api/orders/member?paidLimit=5', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Unable to load your member orders.');
    }
    return payload.orders || [];
  }

  async function cancelPendingOrder(orderId) {
    const response = await fetch(`/api/orders/${encodeURIComponent(String(orderId))}/cancel`, {
      method: 'POST',
      headers: {
        'x-csrf-token': csrfToken
      },
      credentials: 'same-origin'
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Unable to cancel pending order.');
    }
  }

  async function refreshOrders(successMessage) {
    const orders = await loadMemberOrders();
    renderOrders(orders);
    if (successMessage) {
      showMessage(successMessage);
    }
  }

  async function onTableClick(event) {
    const cancelBtn = event.target.closest('.member-order-cancel');
    if (!cancelBtn) return;

    const orderId = cancelBtn.getAttribute('data-order-id');
    if (!orderId) return;

    if (!window.confirm(`Cancel pending order #${orderId}?`)) {
      return;
    }

    cancelBtn.disabled = true;

    try {
      await cancelPendingOrder(orderId);
      await refreshOrders(`Pending order #${orderId} has been cancelled.`);
    } catch (err) {
      showMessage(err.message || 'Unable to cancel pending order.', true);
    } finally {
      cancelBtn.disabled = false;
    }
  }

  async function init() {
    try {
      const authenticated = await ensureAuthenticated();
      if (!authenticated) return;

      if (tableBody) {
        tableBody.addEventListener('click', (event) => {
          onTableClick(event).catch((err) => {
            showMessage(err.message || 'Unable to perform order action.', true);
          });
        });
      }

      await refreshOrders('Loaded your member orders.');
    } catch (err) {
      showMessage(err.message || 'Unable to load member portal.', true);
    }
  }

  init();
})();
