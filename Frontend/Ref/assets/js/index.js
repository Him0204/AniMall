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

  function categoryHref(catid) {
    return `${window.location.pathname}?catid=${catid}`;
  }

  async function load() {
    try {
      const categoriesResponse = await fetch('/api/categories');
      const categories = await categoriesResponse.json();
      if (!categories.length) return;
      if (!selectedCatid || !categories.find((c) => c.catid === selectedCatid)) {
        selectedCatid = categories[0].catid;
        window.history.replaceState({}, '', categoryHref(selectedCatid));
      }
      renderCategories(categories);
      await loadProducts(selectedCatid);
    } catch {
      loadError.hidden = false;
    }
  }

  function renderCategories(categories) {
    categoryList.innerHTML = categories.map((category) => {
      const activeClass = category.catid === selectedCatid ? 'is-active' : '';
      return `<a class="category-pill ${activeClass}" href="${categoryHref(category.catid)}">${escapeHtml(category.name)}</a>`;
    }).join('');
  }

  async function loadProducts(catid) {
    const response = await fetch(`/api/products?catid=${catid}`);
    const products = await response.json();
    productGrid.innerHTML = products.map((product) => {
      const imagePath = product.image_thumb || 'assets/img/img001.webp';
      const price = Number(product.price).toFixed(2);
      return `
      <article class="product-card">
        <a class="product-image-link" href="/product.html?pid=${product.pid}" aria-label="View ${escapeHtml(product.name)}">
          <div class="product-image">
            <img src="${escapeHtml(imagePath)}" alt="${escapeHtml(product.name)}">
          </div>
        </a>
        <div class="product-info">
          <a href="/product.html?pid=${product.pid}" class="product-name">${escapeHtml(product.name)}</a>
          <div class="product-price">HK$${price}</div>
          <button class="product-add-btn js-add-to-cart" type="button"
            data-pid="${product.pid}"
            data-name="${escapeHtml(product.name)}"
            data-price="${product.price}"
            data-image="${escapeHtml(imagePath)}">Add to Cart</button>
        </div>
      </article>
    `;
    }).join('');
  }

  load();
})();
