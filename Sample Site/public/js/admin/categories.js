document.addEventListener('DOMContentLoaded', async () => {
  Auth.requireAdmin();
  const form = document.getElementById('categoryForm');
  const body = document.getElementById('categoriesTableBody');
  const error = document.getElementById('formError');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const title = document.getElementById('formTitle');
  let editingId = null;

  async function loadCategories() {
    const categories = await apiFetch('/admin/categories');
    body.innerHTML = categories.map(c => `
      <tr>
        <td>${c.image_url ? `<img class="admin-thumb" src="${c.image_url}" alt="${c.name}">` : '—'}</td>
        <td>${c.name}</td>
        <td>${c.slug}</td>
        <td>${c.description || '—'}</td>
        <td class="action-cell"><button class="btn-sm btn-edit" data-id="${c.id}">Edit</button><button class="btn-sm btn-danger" data-id="${c.id}">Delete</button></td>
      </tr>`).join('');

    body.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => {
      const c = categories.find(x => x.id === parseInt(btn.dataset.id, 10));
      editingId = c.id;
      title.textContent = 'Edit Category';
      form.name.value = c.name;
      form.description.value = c.description || '';
      cancelBtn.classList.remove('hidden');
    }));

    body.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', async () => {
      await apiFetch(`/admin/categories/${btn.dataset.id}`, { method: 'DELETE' });
      loadCategories();
    }));
  }

  cancelBtn.addEventListener('click', () => {
    editingId = null;
    title.textContent = 'Add Category';
    form.reset();
    cancelBtn.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const data = new FormData(form);
    try {
      if (editingId) await apiFetch(`/admin/categories/${editingId}`, { method: 'PUT', body: data });
      else await apiFetch('/admin/categories', { method: 'POST', body: data });
      editingId = null;
      title.textContent = 'Add Category';
      form.reset();
      cancelBtn.classList.add('hidden');
      loadCategories();
    } catch (e) {
      error.textContent = e.message;
    }
  });

  loadCategories();
});
