document.addEventListener('DOMContentLoaded', async () => {
  Auth.requireAdmin();
  const form = document.getElementById('productForm');
  const body = document.getElementById('productsTableBody');
  const error = document.getElementById('formError');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const title = document.getElementById('formTitle');
  const categorySelect = document.getElementById('categorySelect');
  let editingId = null;

  const categories = await apiFetch('/admin/categories');
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    categorySelect.appendChild(opt);
  });

  async function loadProducts() {
    const products = await apiFetch('/admin/products');
    body.innerHTML = products.map(p => `
      <tr>
        <td>${p.image_url ? `<img class="admin-thumb" src="${p.image_url}" alt="${p.name}">` : '—'}</td>
        <td>${p.name}</td>
        <td>${p.category_name || '—'}</td>
        <td>$${p.price.toFixed(2)}</td>
        <td>${p.stock}</td>
        <td>${p.is_active ? 'Active' : 'Hidden'}</td>
        <td class="action-cell"><button class="btn-sm btn-edit" data-id="${p.id}">Edit</button><button class="btn-sm btn-danger" data-id="${p.id}">Hide</button></td>
      </tr>`).join('');

    body.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => {
      const p = products.find(x => x.id === parseInt(btn.dataset.id, 10));
      editingId = p.id;
      title.textContent = 'Edit Product';
      form.name.value = p.name;
      form.description.value = p.description || '';
      form.price.value = p.price;
      form.stock.value = p.stock;
      form.category_id.value = p.category_id || '';
      form.is_active.value = p.is_active;
      form.stripe_price_id.value = p.stripe_price_id || '';
      cancelBtn.classList.remove('hidden');
    }));

    body.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', async () => {
      await apiFetch(`/admin/products/${btn.dataset.id}`, { method: 'DELETE' });
      loadProducts();
    }));
  }

  cancelBtn.addEventListener('click', () => {
    editingId = null;
    title.textContent = 'Add New Product';
    form.reset();
    cancelBtn.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const data = new FormData(form);
    try {
      if (editingId) await apiFetch(`/admin/products/${editingId}`, { method: 'PUT', body: data });
      else await apiFetch('/admin/products', { method: 'POST', body: data });
      editingId = null;
      title.textContent = 'Add New Product';
      form.reset();
      cancelBtn.classList.add('hidden');
      loadProducts();
    } catch (e) {
      error.textContent = e.message;
    }
  });

  loadProducts();
});
