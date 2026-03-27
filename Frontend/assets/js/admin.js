(() => {
  const MAX_NAME_LENGTH = 120;
  const MAX_IMAGE_COUNT = 8;
  const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png']);
  const VALID_MIME = new Set(['image/jpeg', 'image/png']);

  const messageEl = document.getElementById('admin-message');
  const errorEl = document.getElementById('admin-error');

  const forms = {
    createCategory: document.getElementById('form-create-category'),
    updateCategory: document.getElementById('form-update-category'),
    deleteCategory: document.getElementById('form-delete-category'),
    createProduct: document.getElementById('form-create-product'),
    updateProduct: document.getElementById('form-update-product'),
    deleteProduct: document.getElementById('form-delete-product')
  };

  const selects = {
    updateCategory: document.getElementById('update-category-catid'),
    deleteCategory: document.getElementById('delete-category-catid'),
    createProductCategory: document.getElementById('create-product-catid'),
    updateProductCategory: document.getElementById('update-product-catid'),
    updateProductPid: document.getElementById('update-product-pid'),
    deleteProductPid: document.getElementById('delete-product-pid'),
    createProductType: document.getElementById('create-product-type'),
    updateProductType: document.getElementById('update-product-type')
  };

  function showMessage(message, isError = false) {
    messageEl.hidden = false;
    messageEl.textContent = message;
    messageEl.style.background = isError ? '#fdecea' : '#e8f5e9';
    messageEl.style.color = isError ? '#b71c1c' : '#1b5e20';
    messageEl.style.borderLeftColor = isError ? '#e53935' : '#43a047';
  }

  function clearMessage() {
    messageEl.hidden = true;
    messageEl.textContent = '';
  }

  function setLoadError(visible) {
    errorEl.hidden = !visible;
  }

  function optionHtml(value, label) {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = label;
    return opt;
  }

  function resetSelect(selectEl) {
    while (selectEl.options.length > 0) {
      selectEl.remove(0);
    }
  }

  function appendTypes(validTypes) {
    resetSelect(selects.createProductType);
    for (const type of validTypes) {
      const option = optionHtml(type, type);
      if (type === 'Accessories') option.selected = true;
      selects.createProductType.appendChild(option);
    }

    while (selects.updateProductType.options.length > 1) {
      selects.updateProductType.remove(1);
    }
    for (const type of validTypes) {
      selects.updateProductType.appendChild(optionHtml(type, type));
    }
  }

  function appendCategories(categories) {
    resetSelect(selects.updateCategory);
    resetSelect(selects.deleteCategory);
    resetSelect(selects.createProductCategory);

    while (selects.updateProductCategory.options.length > 1) {
      selects.updateProductCategory.remove(1);
    }

    for (const category of categories) {
      const label = category.name;
      const value = category.catid;
      selects.updateCategory.appendChild(optionHtml(value, label));
      selects.deleteCategory.appendChild(optionHtml(value, label));
      selects.createProductCategory.appendChild(optionHtml(value, label));
      selects.updateProductCategory.appendChild(optionHtml(value, label));
    }
  }

  function appendProducts(products) {
    resetSelect(selects.updateProductPid);
    resetSelect(selects.deleteProductPid);

    for (const product of products) {
      const label = `${product.pid} - ${product.name}`;
      const value = product.pid;
      selects.updateProductPid.appendChild(optionHtml(value, label));
      selects.deleteProductPid.appendChild(optionHtml(value, label));
    }
  }

  async function loadAdminOptions() {
    const response = await fetch('/api/admin/options');
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load admin options.');
    }
    appendCategories(payload.categories || []);
    appendProducts(payload.products || []);
    appendTypes(payload.validTypes || []);
  }

  function validateName(name) {
    const trimmed = String(name || '').trim();
    return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
  }

  function validatePrice(price) {
    const parsed = Number(price);
    return Number.isFinite(parsed) && parsed >= 0;
  }

  function validateFiles(fileInput) {
    const files = fileInput.files || [];
    if (files.length > MAX_IMAGE_COUNT) {
      return 'You can upload up to 8 images.';
    }

    for (const file of files) {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!VALID_EXTS.has(ext) || !VALID_MIME.has(file.type)) {
        return 'Only jpg/jpeg/png files are allowed.';
      }
    }
    return null;
  }

  async function sendJson(url, method, body) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'Request failed.');
    }
    return payload;
  }

  async function sendForm(url, method, formData) {
    const response = await fetch(url, {
      method,
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'Request failed.');
    }
    return payload;
  }

  async function onCreateCategory(event) {
    event.preventDefault();
    clearMessage();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();

    if (!validateName(name)) {
      showMessage('Invalid category name', true);
      return;
    }

    const result = await sendJson('/api/admin/categories', 'POST', { name });
    form.reset();
    await loadAdminOptions();
    showMessage(result.message);
  }

  async function onUpdateCategory(event) {
    event.preventDefault();
    clearMessage();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const catid = Number.parseInt(String(formData.get('catid')), 10);
    const name = String(formData.get('name') || '').trim();

    if (!Number.isInteger(catid) || !validateName(name)) {
      showMessage('Invalid category update input', true);
      return;
    }

    const result = await sendJson(`/api/admin/categories/${catid}`, 'PUT', { name });
    form.reset();
    await loadAdminOptions();
    showMessage(result.message);
  }

  async function onDeleteCategory(event) {
    event.preventDefault();
    clearMessage();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const catid = Number.parseInt(String(formData.get('catid')), 10);

    if (!Number.isInteger(catid)) {
      showMessage('Invalid category', true);
      return;
    }

    const result = await sendJson(`/api/admin/categories/${catid}`, 'DELETE', {});
    form.reset();
    await loadAdminOptions();
    showMessage(result.message);
  }

  async function onCreateProduct(event) {
    event.preventDefault();
    clearMessage();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const catid = Number.parseInt(String(formData.get('catid')), 10);
    const name = String(formData.get('name') || '').trim();
    const price = String(formData.get('price') || '').trim();

    if (!Number.isInteger(catid) || !validateName(name) || !validatePrice(price)) {
      showMessage('Invalid product input', true);
      return;
    }

    const fileError = validateFiles(form.querySelector('input[name="images"]'));
    if (fileError) {
      showMessage(fileError, true);
      return;
    }

    const result = await sendForm('/api/admin/products', 'POST', formData);
    form.reset();
    await loadAdminOptions();
    showMessage(result.message);
  }

  async function onUpdateProduct(event) {
    event.preventDefault();
    clearMessage();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const pid = Number.parseInt(String(formData.get('pid')), 10);

    if (!Number.isInteger(pid)) {
      showMessage('Invalid product update input', true);
      return;
    }

    const maybeName = String(formData.get('name') || '').trim();
    const maybePrice = String(formData.get('price') || '').trim();
    if (maybeName && !validateName(maybeName)) {
      showMessage('Invalid product name', true);
      return;
    }
    if (maybePrice && !validatePrice(maybePrice)) {
      showMessage('Invalid product price', true);
      return;
    }

    const fileError = validateFiles(form.querySelector('input[name="images"]'));
    if (fileError) {
      showMessage(fileError, true);
      return;
    }

    const result = await sendForm(`/api/admin/products/${pid}`, 'PUT', formData);
    form.reset();
    await loadAdminOptions();
    showMessage(result.message);
  }

  async function onDeleteProduct(event) {
    event.preventDefault();
    clearMessage();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const pid = Number.parseInt(String(formData.get('pid')), 10);

    if (!Number.isInteger(pid)) {
      showMessage('Invalid product', true);
      return;
    }

    const result = await sendJson(`/api/admin/products/${pid}`, 'DELETE', {});
    form.reset();
    await loadAdminOptions();
    showMessage(result.message);
  }

  function bindEvents() {
    forms.createCategory.addEventListener('submit', (event) => {
      onCreateCategory(event).catch((err) => showMessage(err.message, true));
    });
    forms.updateCategory.addEventListener('submit', (event) => {
      onUpdateCategory(event).catch((err) => showMessage(err.message, true));
    });
    forms.deleteCategory.addEventListener('submit', (event) => {
      onDeleteCategory(event).catch((err) => showMessage(err.message, true));
    });
    forms.createProduct.addEventListener('submit', (event) => {
      onCreateProduct(event).catch((err) => showMessage(err.message, true));
    });
    forms.updateProduct.addEventListener('submit', (event) => {
      onUpdateProduct(event).catch((err) => showMessage(err.message, true));
    });
    forms.deleteProduct.addEventListener('submit', (event) => {
      onDeleteProduct(event).catch((err) => showMessage(err.message, true));
    });
  }

  function applyLegacyMessageFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get('msg');
    if (!msg) return;
    showMessage(msg, false);
    params.delete('msg');
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', next);
  }

  async function init() {
    bindEvents();
    applyLegacyMessageFromQuery();
    try {
      await loadAdminOptions();
      setLoadError(false);
    } catch {
      setLoadError(true);
      showMessage('Failed to load admin options.', true);
    }
  }

  init();
})();
