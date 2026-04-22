document.addEventListener('DOMContentLoaded', async () => {
  initComponents();
  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) return location.href = '/';
  const container = document.getElementById('productContainer');
  try {
    const p = await apiFetch(`/products/${slug}`);
    document.getElementById('loadingSpinner')?.classList.add('hidden');
    container.innerHTML = `
      <div class="product-detail-grid">
        <div><img class="product-detail-img" src="${p.image_url || '/images/placeholder.png'}" alt="${p.name}"></div>
        <div class="product-detail-info">
          <nav class="breadcrumb"><a href="/">Home</a> / ${p.category_name || 'General'} / ${p.name}</nav>
          <h1 class="product-detail-title">${p.name}</h1>
          <p class="product-detail-price">$${p.price.toFixed(2)}</p>
          <p class="product-detail-stock ${p.stock < 5 ? 'low-stock' : ''}">${p.stock > 0 ? (p.stock < 5 ? `Only ${p.stock} left` : 'In stock') : 'Out of stock'}</p>
          <p class="product-detail-desc">${p.description || ''}</p>
          <div class="product-qty-row"><label for="qtyInput">Qty</label><input id="qtyInput" class="qty-input" type="number" min="1" max="${p.stock}" value="1" ${p.stock === 0 ? 'disabled' : ''}></div>
          <button id="addToCartBtn" class="btn-primary btn-lg" ${p.stock === 0 ? 'disabled' : ''}>Add to Cart</button>
        </div>
      </div>`;

    document.getElementById('addToCartBtn')?.addEventListener('click', () => {
      const quantity = parseInt(document.getElementById('qtyInput').value, 10) || 1;
      Cart.addItem(p, quantity);
    });
  } catch (e) {
    container.innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
});
