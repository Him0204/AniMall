document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const error = document.getElementById('formError');
  const button = document.getElementById('submitBtn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (password !== confirm) { error.textContent = 'Passwords do not match'; return; }
    button.disabled = true;
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('username').value.trim(),
          email: document.getElementById('email').value.trim(),
          password
        })
      });
      Auth.setSession(data.token, data.user);
      location.href = '/';
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
    }
  });
});
