(() => {
  const messageEl = document.getElementById('auth-message');
  const errorEl = document.getElementById('auth-error');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  let csrfToken = '';

  function clearMessages() {
    [messageEl, errorEl].forEach((el) => {
      if (!el) return;
      el.hidden = true;
      el.textContent = '';
    });
  }

  function showMessage(text, isError = false) {
    clearMessages();
    const el = isError ? errorEl : messageEl;
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
  }

  function setCsrfInputs(token) {
    document.querySelectorAll('.csrf-token-input').forEach((input) => {
      input.value = token;
    });
  }

  async function fetchCsrfToken() {
    const response = await fetch('/api/csrf-token', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.csrfToken) {
      throw new Error('Unable to initialize security token.');
    }
    csrfToken = payload.csrfToken;
    setCsrfInputs(csrfToken);
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearMessages();

    const formData = new FormData(loginForm);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    if (!email || password.length < 10) {
      showMessage('Enter a valid email and a password with at least 10 characters.', true);
      return;
    }

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
      },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Login failed.');
    }

    csrfToken = payload.csrfToken || csrfToken;
    setCsrfInputs(csrfToken);
    showMessage('Login successful. Redirecting...');
    const target = payload.user && payload.user.is_admin ? 'admin.html' : 'index.html';
    setTimeout(() => { window.location.href = target; }, 400);
  }

  async function handleRegister(event) {
    event.preventDefault();
    clearMessages();

    const formData = new FormData(registerForm);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');
    const name = String(formData.get('name') || '').trim();

    if (!email || password.length < 10 || password !== confirmPassword) {
      showMessage('Please provide a valid email and matching passwords (min 10 characters).', true);
      return;
    }

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
      },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password, confirmPassword, name })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Registration failed.');
    }

    showMessage('Registration successful. You can now log in.');
    registerForm.reset();
  }

  async function init() {
    try {
      await fetchCsrfToken();
    } catch (err) {
      showMessage(err.message || 'Unable to start session.', true);
      return;
    }

    loginForm.addEventListener('submit', (event) => {
      handleLogin(event).catch((err) => showMessage(err.message, true));
    });

    registerForm.addEventListener('submit', (event) => {
      handleRegister(event).catch((err) => showMessage(err.message, true));
    });
  }

  init();
})();
