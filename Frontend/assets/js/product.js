(() => {
  const detailSection = document.getElementById('product-detail');
  const errorBox = document.getElementById('load-error');
  const breadcrumbs = document.getElementById('product-breadcrumbs');
  const nameEl = document.getElementById('product-name');
  const priceEl = document.getElementById('product-price');
  const descriptionEl = document.getElementById('product-description');
  const imageEl = document.getElementById('product-image');

  const params = new URLSearchParams(window.location.search);
  const pid = Number.parseInt(params.get('pid') || '', 10);

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  async function loadProduct() {
    if (!pid) {
      errorBox.hidden = false;
      return;
    }
    try {
      const response = await fetch(`/api/product/${pid}`);
      if (!response.ok) throw new Error('not found');
      const product = await response.json();

      document.title = `AniMall - ${product.name}`;
      nameEl.textContent = product.name;
      priceEl.textContent = `HK$${Number(product.price).toFixed(2)}`;
      descriptionEl.textContent = product.description || 'No description provided.';
      imageEl.src = product.image_large || 'assets/img/img001.webp';
      imageEl.alt = product.name;
      breadcrumbs.innerHTML = `<a href="index.html">Home</a><span class="sep">›</span><a href="category.html?catid=${product.catid}">${escapeHtml(product.category_name)}</a><span class="sep">›</span><span aria-current="page">${escapeHtml(product.name)}</span>`;
      detailSection.hidden = false;
    } catch (err) {
      errorBox.hidden = false;
    }
  }

  loadProduct();
})();
