(() => {
  const loginBtn = document.querySelector('.login-btn');
  const userLabel = document.querySelector('.user-label');

  if (!loginBtn || !userLabel) return;

  async function refreshUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const payload = await res.json().catch(() => ({}));
      const user = payload.user;
      if (res.ok && payload.authenticated && user) {
        userLabel.textContent = user.name || user.email || 'User';
        loginBtn.textContent = 'Logout';
        loginBtn.setAttribute('aria-label', 'Logout');
        loginBtn.href = '#';
        loginBtn.addEventListener('click', (e) => {
          e.preventDefault();
          fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'x-csrf-token': payload.csrfToken || '' },
            credentials: 'same-origin'
          }).finally(() => {
            window.location.href = 'login.html';
          });
        }, { once: true });
      } else {
        userLabel.textContent = 'Guest';
        loginBtn.textContent = 'Login';
        loginBtn.setAttribute('aria-label', 'Login');
        loginBtn.href = 'login.html';
      }
    } catch {
      userLabel.textContent = 'Guest';
      loginBtn.textContent = 'Login';
      loginBtn.href = 'login.html';
    }
  }

  refreshUser();
})();
