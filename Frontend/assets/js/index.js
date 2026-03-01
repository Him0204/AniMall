(() => {
  const productGrid = document.getElementById('product-grid');
  const loadError = document.getElementById('load-error');
  const resultsCount = document.getElementById('results-count');
  const sortSelect = document.getElementById('sort-select');

  const isCategoryPage = window.location.pathname.includes('category.html');
  const params = new URLSearchParams(window.location.search);
  let selectedCatid = Number.parseInt(params.get('catid') || '', 10);

  // All loaded products for current view (used for client-side filter/sort)
  let allProducts = [];
  let activeFilter = 'all';

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function productCard(product, catName) {
    const typeTag = product.type ? `<span class="tag tag-product">${escapeHtml(product.type)}</span>` : '';
    return `
      <article class="product-card">
        <a class="product-image-link" href="product.html?pid=${product.pid}" aria-label="View ${escapeHtml(product.name)}">
          <div class="product-image">
            <img src="${escapeHtml(product.image_thumb || 'assets/img/img001.webp')}" alt="${escapeHtml(product.name)}">
          </div>
        </a>
        <div class="product-info">
          <a href="product.html?pid=${product.pid}" class="product-name">${escapeHtml(product.name)}</a>
          <div class="product-tags">
            <span class="tag tag-animal">${escapeHtml(catName)}</span>
            ${typeTag}
          </div>
          <div class="product-price">HK$${Number(product.price).toFixed(2)}</div>
          <button class="product-add-btn" type="button" aria-label="Add ${escapeHtml(product.name)} to cart">Add to Cart</button>
        </div>
      </article>`;
  }

  function applyFilterSort() {
    let list = allProducts.slice();

    // Filter by product type
    if (activeFilter !== 'all') {
      list = list.filter((p) => (p.type || '') === activeFilter);
    }

    // Client-side sort
    const sortVal = sortSelect ? sortSelect.value : 'featured';
    if (sortVal === 'price-low') list.sort((a, b) => a.price - b.price);
    else if (sortVal === 'price-high') list.sort((a, b) => b.price - a.price);

    if (resultsCount) {
      resultsCount.textContent = `Showing ${list.length} product${list.length !== 1 ? 's' : ''}`;
    }

    productGrid.innerHTML = list.map((p) => productCard(p, p._catName)).join('');
  }

  async function loadCategoryPage() {
    const categoriesRes = await fetch('/api/categories');
    const categories = await categoriesRes.json();
    if (!categories.length) return;

    if (!selectedCatid || !categories.find((c) => c.catid === selectedCatid)) {
      selectedCatid = categories[0].catid;
      window.history.replaceState({}, '', `category.html?catid=${selectedCatid}`);
    }

    // Update breadcrumb
    const selectedCat = categories.find((c) => c.catid === selectedCatid);
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');
    if (breadcrumbCurrent && selectedCat) breadcrumbCurrent.textContent = selectedCat.name;

    const res = await fetch(`/api/products?catid=${selectedCatid}`);
    const products = await res.json();
    const catName = selectedCat ? selectedCat.name : '';
    allProducts = products.map((p) => ({ ...p, _catName: catName }));
    applyFilterSort();
  }

  async function loadIndexPage() {
    const categoriesRes = await fetch('/api/categories');
    const categories = await categoriesRes.json();

    const all = await Promise.all(
      categories.map(async (cat) => {
        const res = await fetch(`/api/products?catid=${cat.catid}`);
        const products = await res.json();
        return products.map((p) => ({ ...p, _catName: cat.name }));
      })
    );

    allProducts = all.flat();
    productGrid.innerHTML = allProducts.map((p) => productCard(p, p._catName)).join('');
  }

  async function load() {
    try {
      if (isCategoryPage) {
        await loadCategoryPage();
      } else {
        await loadIndexPage();
      }
    } catch {
      if (loadError) loadError.hidden = false;
    }
  }

  // Wire up filter buttons (category page only)
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilterSort();
    });
  });

  // Wire up sort select
  if (sortSelect) {
    sortSelect.addEventListener('change', applyFilterSort);
  }

  load();
})();
