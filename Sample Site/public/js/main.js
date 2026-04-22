let currentCategory = '';
let currentPage = 1;
const limit = 12;
let totalPages = 1;

async function loadCategories() {
  const categories = await apiFetch('/categories');
  const list = document.getElementById('categoryList');
  list.innerHTML = '';

  const all = document.createElement('button');
  all.className = 'cat-btn active';
  all.dataset.slug = '';
  all.textContent = 'All';
  all.addEventListener('click', () => setCategory(''));
  list.appendChild(all);

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.slug = cat.slug;
    btn.textContent = `${cat.name} (${cat.product_count})`;
    btn.addEventListener('click', () => setCategory(cat.slug));
    list.appendChild(btn);
  });
}

function setCategory(slug) {
  currentCategory = slug;
  currentPage = 1;
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.slug === slug));
  loadProducts();
}

async function loadProducts() {
  const params = new URLSearchParams({ page: currentPage, limit });
  const search = document.getElementById('searchInput')?.value.trim();
  if (currentCategory) params.set('category', currentCategory);
  if (search) params.set('search', search);
  const grid = document.getElementById('productsGrid');
  const spinner = document.getElementById('loadingSpinner');
  spinner?.classList.remove('hidden');
  try {
    const data = await apiFetch('/products?' + params.toString());
    totalPages = Math.max(1, Math.ceil(data.total / limit));
    renderProducts(data.products);
    renderPagination();
  } catch (e) {
    grid.innerHTML = `<p class="error-msg">${e.message}</p>`;
  } finally {
    spinner?.classList.add('hidden');
  }
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  if (!products.length) {
    grid.innerHTML = '<p class="no-results">No products found.</p>';
    return;
  }
  grid.innerHTML = products.map(p => `
    <article class="product-card">
      <a href="/product.html?slug=${p.slug}" class="product-card-img-link"><img class="product-card-img" src="${p.image_url || '/images/placeholder.png'}" alt="${p.name}"></a>
      <div class="product-card-body">
        <span class="product-category-badge">${p.category_name || 'General'}</span>
        <h2 class="product-card-title"><a href="/product.html?slug=${p.slug}">${p.name}</a></h2>
        <p class="product-card-desc">${(p.description || '').slice(0, 90)}</p>
        <div class="product-card-footer"><span class="product-price">$${p.price.toFixed(2)}</span><span class="product-stock ${p.stock < 5 ? 'low-stock' : ''}">${p.stock > 0 ? (p.stock < 5 ? `Only ${p.stock} left` : 'In stock') : 'Out of stock'}</span></div>
        <button class="btn-primary btn-block add-to-cart-btn" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-img="${p.image_url || ''}" ${p.stock === 0 ? 'disabled' : ''}>${p.stock === 0 ? 'Out of Stock' : 'Add to Cart'}</button>
      </div>
    </article>`).join('');

  grid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Cart.addItem({
        id: parseInt(btn.dataset.id, 10),
        name: btn.dataset.name,
        price: parseFloat(btn.dataset.price),
        image_url: btn.dataset.img
      });
    });
  });
}

function renderPagination() {
  const el = document.getElementById('pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="pg-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Prev</button>
    <span class="pg-info">Page ${currentPage} / ${totalPages}</span>
    <button class="pg-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next</button>`;
  el.querySelectorAll('.pg-btn').forEach(btn => btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page, 10); loadProducts(); }));
}

document.addEventListener('DOMContentLoaded', () => {
  initComponents();
  loadCategories();
  loadProducts();
  let timer;
  document.getElementById('searchInput')?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { currentPage = 1; loadProducts(); }, 300);
  });
});
