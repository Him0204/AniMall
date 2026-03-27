(() => {
  const messageEl = document.getElementById('auth-message');
  const errorEl = document.getElementById('auth-error');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const passwordForm = document.getElementById('password-form');
  const authSections = {
    login: document.getElementById('login-section'),
    register: document.getElementById('register-section'),
    password: document.getElementById('password-section')
  };

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

  function isStrongPassword(pwd) {
    return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+=-]{10,64}$/.test(String(pwd || ''));
  }

  function focusFirstInput(section) {
    const firstInput = section && section.querySelector('input:not([type="hidden"])');
    if (firstInput) {
      firstInput.focus();
    }
  }

  function setActiveSection(key) {
    Object.entries(authSections).forEach(([sectionKey, sectionEl]) => {
      if (!sectionEl) return;
      const isTarget = sectionKey === key;
      sectionEl.classList.toggle('is-active', isTarget);
      if (isTarget) {
        sectionEl.removeAttribute('hidden');
        sectionEl.setAttribute('aria-hidden', 'false');
      } else {
        sectionEl.setAttribute('hidden', '');
        sectionEl.setAttribute('aria-hidden', 'true');
      }
    });
    const activeSection = authSections[key];
    if (activeSection) {
      focusFirstInput(activeSection);
    }
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

    if (!email || !isStrongPassword(password)) {
      showMessage('Enter a valid email and a strong password (letters, numbers, 10-64 chars, no spaces/quotes).', true);
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
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (!name) {
      showMessage('Please provide your name.', true);
      return;
    }

    if (!email || !isStrongPassword(password) || password !== confirmPassword) {
      showMessage('Please provide a valid email and matching strong passwords (letters, numbers, 10-64 chars, no spaces/quotes).', true);
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

  async function handleChangePassword(event) {
    event.preventDefault();
    clearMessages();

    const formData = new FormData(passwordForm);
    const currentPassword = String(formData.get('currentPassword') || '');
    const newPassword = String(formData.get('newPassword') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (!currentPassword) {
      showMessage('Please provide your current password.', true);
      return;
    }

    if (!isStrongPassword(newPassword) || newPassword !== confirmPassword) {
      showMessage('Please provide matching strong new passwords (letters, numbers, 10-64 chars, no spaces/quotes).', true);
      return;
    }

    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
      },
      credentials: 'same-origin',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Unable to change password.');
    }

    showMessage('Password changed. Please log in again.');
    passwordForm.reset();
    setTimeout(() => { window.location.href = 'login.html'; }, 500);
  }

  async function init() {
    try {
      await fetchCsrfToken();
    } catch (err) {
      showMessage(err.message || 'Unable to start session.', true);
      return;
    }

    // Section toggles
    document.querySelectorAll('[data-auth-target]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        const target = el.getAttribute('data-auth-target');
        if (target) {
          clearMessages();
          setActiveSection(target);
        }
      });
    });

    // Default to login panel
    setActiveSection('login');

    loginForm.addEventListener('submit', (event) => {
      handleLogin(event).catch((err) => showMessage(err.message, true));
    });

    registerForm.addEventListener('submit', (event) => {
      handleRegister(event).catch((err) => showMessage(err.message, true));
    });

    if (passwordForm) {
      passwordForm.addEventListener('submit', (event) => {
        handleChangePassword(event).catch((err) => showMessage(err.message, true));
      });
    }
  }

  init();
})();
