(() => {
  const categoryList = document.getElementById('category-list');
  const productGrid = document.getElementById('product-grid');
  const loadError = document.getElementById('load-error');

  const params = new URLSearchParams(window.location.search);
  let selectedCatid = Number.parseInt(params.get('catid') || '', 10);

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  async function load() {
    try {
      const categoriesResponse = await fetch('/api/categories');
      const categories = await categoriesResponse.json();
      if (!categories.length) return;
      if (!selectedCatid || !categories.find((c) => c.catid === selectedCatid)) {
        selectedCatid = categories[0].catid;
        window.history.replaceState({}, '', `/?catid=${selectedCatid}`);
      }
      renderCategories(categories);
      await loadProducts(selectedCatid);
    } catch (err) {
      loadError.hidden = false;
    }
  }

  function renderCategories(categories) {
    categoryList.innerHTML = categories.map((category) => {
      const activeClass = category.catid === selectedCatid ? 'is-active' : '';
      return `<a class="category-pill ${activeClass}" href="/?catid=${category.catid}">${escapeHtml(category.name)}</a>`;
    }).join('');
  }

  async function loadProducts(catid) {
    const response = await fetch(`/api/products?catid=${catid}`);
    const products = await response.json();
    productGrid.innerHTML = products.map((product) => `
      <article class="product-card">
        <a class="product-image-link" href="/product.html?pid=${product.pid}" aria-label="View ${escapeHtml(product.name)}">
          <div class="product-image">
            <img src="${escapeHtml(product.image_thumb || 'assets/img/img001.webp')}" alt="${escapeHtml(product.name)}">
          </div>
        </a>
        <div class="product-info">
          <a href="/product.html?pid=${product.pid}" class="product-name">${escapeHtml(product.name)}</a>
          <div class="product-price">HK$${Number(product.price).toFixed(2)}</div>
          <button class="product-add-btn" type="button">Add to Cart</button>
        </div>
      </article>
    `).join('');
  }

  load();
})();
