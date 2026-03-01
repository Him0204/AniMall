(() => {
  const productGrid = document.getElementById('product-grid');
  const loadError = document.getElementById('load-error');
  const resultsCount = document.getElementById('results-count');
  const sortSelect = document.getElementById('sort-select');
  const categoryTabs = document.getElementById('category-tabs');
  const breadcrumbSep = document.getElementById('breadcrumb-sep');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');

  const params = new URLSearchParams(window.location.search);
  let selectedCatid = Number.parseInt(params.get('catid') || '', 10) || 'all';
  let activeFilter = params.get('type') || 'all';

  document.querySelectorAll('[data-type]').forEach((a) => {
    a.href = `index.html?type=${encodeURIComponent(a.dataset.type)}`;
  });

  let allCategories = [];
  let allProducts = [];

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
          <button class="product-add-btn" type="button" data-pid="${product.pid}" aria-label="Add ${escapeHtml(product.name)} to cart">Add to Cart</button>
        </div>
      </article>`;
  }

  function applyFilterSort() {
    let list = allProducts.slice();

    if (activeFilter !== 'all') {
      list = list.filter((p) => (p.type || '') === activeFilter);
    }

    const sortVal = sortSelect ? sortSelect.value : 'featured';
    if (sortVal === 'price-low') list.sort((a, b) => a.price - b.price);
    else if (sortVal === 'price-high') list.sort((a, b) => b.price - a.price);

    if (resultsCount) {
      resultsCount.textContent = `Showing ${list.length} product${list.length !== 1 ? 's' : ''}`;
    }

    productGrid.innerHTML = list.map((p) => productCard(p, p._catName)).join('');
  }

  function updateBreadcrumb() {
    if (selectedCatid === 'all') {
      if (breadcrumbSep) breadcrumbSep.hidden = true;
      if (breadcrumbCurrent) breadcrumbCurrent.hidden = true;
    } else {
      const cat = allCategories.find((c) => c.catid === selectedCatid);
      if (cat && breadcrumbCurrent) {
        breadcrumbCurrent.textContent = cat.name;
        breadcrumbCurrent.hidden = false;
        if (breadcrumbSep) breadcrumbSep.hidden = false;
      }
    }
  }

  function buildCategoryTabs(categories) {
    document.querySelectorAll('[data-cat-name]').forEach((a) => {
      const cat = categories.find((c) => c.name.toLowerCase() === a.dataset.catName.toLowerCase());
      if (cat) a.href = `index.html?catid=${cat.catid}`;
    });

    const allBtn = categoryTabs.querySelector('[data-catid="all"]');
    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.type = 'button';
      btn.dataset.catid = cat.catid;
      btn.textContent = cat.name;
      categoryTabs.appendChild(btn);
    });

    categoryTabs.querySelectorAll('[data-catid]').forEach((btn) => {
      const val = btn.dataset.catid === 'all' ? 'all' : Number(btn.dataset.catid);
      btn.classList.toggle('active', val === selectedCatid);
    });

    categoryTabs.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-catid]');
      if (!btn) return;
      const val = btn.dataset.catid === 'all' ? 'all' : Number(btn.dataset.catid);
      if (val === selectedCatid) return;
      selectedCatid = val;

      categoryTabs.querySelectorAll('[data-catid]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      activeFilter = 'all';
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === 'all'));

      const url = selectedCatid === 'all' ? 'index.html' : `index.html?catid=${selectedCatid}`;
      window.history.pushState({}, '', url);
      updateBreadcrumb();
      await fetchProducts();
    });
  }

  async function fetchProducts() {
    if (selectedCatid === 'all') {
      const all = await Promise.all(
        allCategories.map(async (cat) => {
          const res = await fetch(`/api/products?catid=${cat.catid}`);
          const products = await res.json();
          return products.map((p) => ({ ...p, _catName: cat.name }));
        })
      );
      allProducts = all.flat();
    } else {
      const cat = allCategories.find((c) => c.catid === selectedCatid);
      const res = await fetch(`/api/products?catid=${selectedCatid}`);
      const products = await res.json();
      allProducts = products.map((p) => ({ ...p, _catName: cat ? cat.name : '' }));
    }
    applyFilterSort();
  }

  async function load() {
    try {
      document.querySelectorAll('[data-filter]').forEach((b) => {
        b.classList.toggle('active', b.dataset.filter === activeFilter);
      });

      const res = await fetch('/api/categories');
      allCategories = await res.json();

      if (selectedCatid !== 'all' && !allCategories.find((c) => c.catid === selectedCatid)) {
        selectedCatid = 'all';
        window.history.replaceState({}, '', 'index.html');
      }

      buildCategoryTabs(allCategories);
      updateBreadcrumb();
      await fetchProducts();
    } catch {
      if (loadError) loadError.hidden = false;
    }
  }

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilterSort();
    });
  });

  if (sortSelect) sortSelect.addEventListener('change', applyFilterSort);

  load();
})();

