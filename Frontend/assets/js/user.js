(() => {
  const loginBtn = document.querySelector('.login-btn');
  const userLabel = document.querySelector('.user-label');
  const adminLinks = document.querySelectorAll('.admin-link');

  if (!loginBtn || !userLabel) return;

  async function refreshUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const payload = await res.json().catch(() => ({}));
      const user = payload.user;
      const csrfToken = payload.csrfToken;
      if (res.ok && payload.authenticated && user) {
        userLabel.textContent = user.name || user.email || 'User';
        loginBtn.textContent = 'Logout';
        loginBtn.setAttribute('aria-label', 'Logout');
        loginBtn.href = '#';
        loginBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const headers = csrfToken ? { 'x-csrf-token': csrfToken } : {};
          fetch('/api/auth/logout', {
            method: 'POST',
            headers,
            credentials: 'same-origin'
          }).finally(() => {
            window.location.href = 'login.html';
          });
        }, { once: true });

        adminLinks.forEach((link) => {
          link.style.display = user.is_admin ? '' : 'none';
          link.setAttribute('aria-hidden', user.is_admin ? 'false' : 'true');
        });
      } else {
        userLabel.textContent = 'Guest';
        loginBtn.textContent = 'Login';
        loginBtn.setAttribute('aria-label', 'Login');
        loginBtn.href = 'login.html';

        adminLinks.forEach((link) => {
          link.style.display = 'none';
          link.setAttribute('aria-hidden', 'true');
        });
      }
    } catch {
      userLabel.textContent = 'Guest';
      loginBtn.textContent = 'Login';
      loginBtn.href = 'login.html';

      adminLinks.forEach((link) => {
        link.style.display = 'none';
        link.setAttribute('aria-hidden', 'true');
      });
    }
  }

  refreshUser();
})();
