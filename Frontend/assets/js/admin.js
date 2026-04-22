(() => {
  const MAX_NAME_LENGTH = 120;
  const MAX_IMAGE_COUNT = 8;
  const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png']);
  const VALID_MIME = new Set(['image/jpeg', 'image/png']);

  let csrfToken = '';

  const messageEl = document.getElementById('admin-message');
  const errorEl = document.getElementById('admin-error');
  const adminGrid = document.querySelector('.admin-grid');
  const adminBackLink = document.querySelector('.admin-back-link');
  const adminHeading = document.querySelector('.admin-page h1');
  const adminOrdersBody = document.getElementById('admin-orders-body');
  const adminOrdersEmpty = document.getElementById('admin-orders-empty');
  const refreshOrdersBtn = document.getElementById('refresh-orders-btn');

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

  const esc = (v) =>
    String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  function setAdminContentVisible(isVisible) {
    const toggle = (el) => {
      if (!el) return;
      el.hidden = !isVisible;
      el.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    };
    toggle(adminGrid);
    toggle(adminBackLink);
    toggle(adminHeading);
  }

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

  function formatMoney(cents, currency = 'HKD') {
    const amount = Number(cents) / 100;
    if (!Number.isFinite(amount)) return `${currency} 0.00`;
    return `${currency} ${amount.toFixed(2)}`;
  }

  function formatTime(ts) {
    const parsed = Number(ts);
    if (!Number.isFinite(parsed) || parsed < 1) return '-';
    return new Date(parsed).toLocaleString();
  }

  function setOrdersEmpty(isEmpty) {
    if (adminOrdersEmpty) {
      adminOrdersEmpty.hidden = !isEmpty;
    }
  }

  function itemSummary(items) {
    if (!Array.isArray(items) || !items.length) return '-';
    return items
      .map((item) => `${esc(item.product_name)} x${esc(item.quantity)}`)
      .join(', ');
  }

  function setCsrfInputs(token) {
    document.querySelectorAll('.csrf-token-input').forEach((input) => {
      input.value = token;
    });
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

  async function ensureSession() {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.authenticated || !payload.user || !payload.user.is_admin) {
      throw new Error('You must be an admin to access this page.');
    }

    csrfToken = payload.csrfToken;
    setCsrfInputs(csrfToken);
  }

  async function loadAdminOptions() {
    const response = await fetch('/api/admin/options', { credentials: 'same-origin' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load admin options.');
    }
    appendCategories(payload.categories || []);
    appendProducts(payload.products || []);
    appendTypes(payload.validTypes || []);
  }

  async function loadOrders() {
    if (!adminOrdersBody) return;

    const response = await fetch('/api/admin/orders?limit=80', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'Failed to load orders.');
    }

    const orders = payload.orders || [];
    if (!orders.length) {
      adminOrdersBody.innerHTML = '';
      setOrdersEmpty(true);
      return;
    }

    const rows = orders.map((order) => {
      const userLabel = order.user_email || `User #${order.userid}`;
      const paidSuffix = order.paid_at ? ` (paid ${esc(formatTime(order.paid_at))})` : '';
      return `<tr>
        <td>#${esc(order.orderid)}</td>
        <td>${esc(userLabel)}</td>
        <td>${esc(order.status)}${paidSuffix}</td>
        <td>${esc(formatMoney(order.total_amount_cents, order.currency))}</td>
        <td>${itemSummary(order.items)}</td>
        <td>${esc(formatTime(order.created_at))}</td>
      </tr>`;
    });

    adminOrdersBody.innerHTML = rows.join('');
    setOrdersEmpty(false);
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
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'Request failed.');
    }
    return payload;
  }

  async function sendForm(url, method, formData) {
    if (csrfToken && !formData.get('csrfToken')) {
      formData.append('csrfToken', csrfToken);
    }
    const response = await fetch(url, {
      method,
      body: formData,
      credentials: 'same-origin',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined
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

    if (refreshOrdersBtn) {
      refreshOrdersBtn.addEventListener('click', () => {
        clearMessage();
        loadOrders()
          .then(() => showMessage('Orders refreshed.'))
          .catch((err) => showMessage(err.message, true));
      });
    }

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
    setAdminContentVisible(false);
    try {
      await ensureSession();
      await loadAdminOptions();
      setAdminContentVisible(true);
      setLoadError(false);
      await loadOrders();
    } catch (err) {
      setAdminContentVisible(false);
      setLoadError(true);
      showMessage(err.message || 'Failed to load admin options.', true);
      return;
    }
  }

  init();
})();
