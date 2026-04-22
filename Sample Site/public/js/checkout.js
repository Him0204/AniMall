document.addEventListener('DOMContentLoaded', () => {
  Auth.requireAuth();
  initComponents();
  const items = Cart.getItems();
  if (!items.length) return location.href = '/';
  Cart.renderItems(document.getElementById('checkoutCartItems'));
  Cart.refreshUI();

  const error = document.getElementById('formError');
  document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    try {
      const order = await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items,
          shipping: {
            name: document.getElementById('fullName').value.trim(),
            email: document.getElementById('email').value.trim(),
            address: document.getElementById('address').value.trim()
          }
        })
      });
      Cart.clear();
      location.href = `/checkout-success.html?order_id=${order.id}`;
    } catch (e) {
      error.textContent = e.message;
    }
  });

  document.getElementById('stripeBtn')?.addEventListener('click', async () => {
    try {
      const data = await apiFetch('/stripe/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ items })
      });
      if (data?.url) location.href = data.url;
    } catch (e) {
      error.textContent = e.message;
    }
  });
});
