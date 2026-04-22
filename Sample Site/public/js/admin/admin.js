document.addEventListener('DOMContentLoaded', () => {
  Auth.requireAdmin();
  const el = document.getElementById('adminUsername');
  if (el) el.textContent = Auth.getUser()?.username || 'Admin';
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    Auth.clearSession();
    location.href = '/login.html';
  });
});
