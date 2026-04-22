const Auth = {
  getToken() { return localStorage.getItem('token'); },
  getUser() {
    try { return JSON.parse(localStorage.getItem('user')); }
    catch { return null; }
  },
  isLoggedIn() { return !!this.getToken(); },
  isAdmin() { return this.getUser()?.role === 'admin'; },
  setSession(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  requireAuth() {
    if (!this.isLoggedIn()) location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname);
  },
  requireAdmin() {
    if (!this.isLoggedIn() || !this.isAdmin()) location.href = '/login.html';
  }
};
window.Auth = Auth;
