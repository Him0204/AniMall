document.addEventListener('DOMContentLoaded', () => {
  if (Auth.isLoggedIn()) location.href = '/';
  const form = document.getElementById('loginForm');
  const error = document.getElementById('formError');
  const button = document.getElementById('submitBtn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    button.disabled = true;
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: document.getElementById('email').value.trim(), password: document.getElementById('password').value })
      });
      Auth.setSession(data.token, data.user);
      const redirect = new URLSearchParams(location.search).get('redirect') || '/';
      location.href = redirect;
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
    }
  });
});
