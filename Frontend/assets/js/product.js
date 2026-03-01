(() => {
  const detailSection = document.getElementById('product-detail');
  const errorBox = document.getElementById('load-error');
  const galleryEl = document.getElementById('product-gallery');
  const breadcrumbs = document.getElementById('product-breadcrumbs');
  const nameEl = document.getElementById('product-name');
  const priceEl = document.getElementById('product-price');
  const descriptionEl = document.getElementById('product-description');

  const params = new URLSearchParams(window.location.search);
  const pid = Number.parseInt(params.get('pid') || '', 10);

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function buildGallery(images, productName) {
    if (!images.length) return '';

    const radios = images.map((_, i) =>
      `<input class="gallery-radios" type="radio" name="gallery" id="g${i + 1}"${i === 0 ? ' checked' : ''}>`
    ).join('\n');

    const panels = images.map((img, i) =>
      `<div class="media-panel m${i + 1}"><img src="${escapeHtml(img.image_large)}" alt="${escapeHtml(productName)}"></div>`
    ).join('\n');

    const thumbnails = images.length > 1
      ? `<div class="product-thumbnails" role="group" aria-label="Select product image">
        ${images.map((img, i) =>
          `<label class="product-thumbnail" for="g${i + 1}" aria-label="View image ${i + 1}"><img src="${escapeHtml(img.image_thumb)}" alt="" aria-hidden="true"></label>`
        ).join('\n')}
      </div>` : '';

    return `${radios}
      <div class="product-main-media" aria-label="Selected product image">
        ${panels}
      </div>
      ${thumbnails}`;
  }

  async function loadProduct() {
    if (!pid) {
      errorBox.hidden = false;
      return;
    }
    try {
      const [productRes, imagesRes] = await Promise.all([
        fetch(`/api/product/${pid}`),
        fetch(`/api/product/${pid}/images`)
      ]);
      if (!productRes.ok) throw new Error('not found');
      const product = await productRes.json();
      const images = imagesRes.ok ? await imagesRes.json() : [];

      // Fall back to product.image_large if no rows in product_images
      const galleryImages = images.length > 0
        ? images
        : (product.image_large ? [{ image_large: product.image_large, image_thumb: product.image_large }] : []);

      document.title = `AniMall - ${product.name}`;
      nameEl.textContent = product.name;
      priceEl.textContent = `HK$${Number(product.price).toFixed(2)}`;
      descriptionEl.textContent = product.description || 'No description provided.';

      if (galleryEl) galleryEl.innerHTML = buildGallery(galleryImages, product.name);

      breadcrumbs.innerHTML = `<a href="index.html">Home</a><span class="sep">›</span><a href="category.html?catid=${product.catid}">${escapeHtml(product.category_name)}</a><span class="sep">›</span><span aria-current="page">${escapeHtml(product.name)}</span>`;
      detailSection.hidden = false;
    } catch {
      errorBox.hidden = false;
    }
  }

  loadProduct();
})();
