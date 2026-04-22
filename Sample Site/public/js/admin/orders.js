document.addEventListener('DOMContentLoaded', async () => {
  Auth.requireAdmin();
  const body = document.getElementById('ordersTableBody');

  async function loadOrders() {
    const orders = await apiFetch('/admin/orders');
    body.innerHTML = orders.map(o => `
      <tr>
        <td>#${o.id}</td>
        <td>${o.username || 'User'}</td>
        <td>$${o.total.toFixed(2)}</td>
        <td>
          <select class="status-select" data-id="${o.id}">
            ${['pending','paid','shipped','delivered','cancelled'].map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${new Date(o.created_at).toLocaleDateString()}</td>
        <td><button class="btn-sm btn-view" data-id="${o.id}">View</button></td>
      </tr>`).join('');

    body.querySelectorAll('.status-select').forEach(select => select.addEventListener('change', async () => {
      await apiFetch(`/admin/orders/${select.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: select.value }) });
    }));

    body.querySelectorAll('.btn-view').forEach(btn => btn.addEventListener('click', async () => {
      const order = await apiFetch(`/admin/orders/${btn.dataset.id}`);
      const lines = order.items.map(i => `${i.product_name} x ${i.quantity}`).join('\n');
      alert(`Order #${order.id}\n\n${lines}\n\nTotal: $${order.total.toFixed(2)}`);
    }));
  }

  loadOrders();
});
