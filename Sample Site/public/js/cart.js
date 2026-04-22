const Cart = {
  key: 'shop_cart',
  getItems() {
    try { return JSON.parse(localStorage.getItem(this.key) || '[]'); }
    catch { return []; }
  },
  save(items) {
    localStorage.setItem(this.key, JSON.stringify(items));
    this.refreshUI();
    window.dispatchEvent(new Event('cartUpdated'));
  },
  addItem(product, quantity = 1) {
    const items = this.getItems();
    const found = items.find(i => i.id === product.id);
    if (found) found.quantity += quantity;
    else items.push({ id: product.id, name: product.name, price: product.price, image_url: product.image_url || '', quantity });
    this.save(items);
  },
  updateQuantity(id, quantity) {
    if (quantity <= 0) return this.removeItem(id);
    const items = this.getItems();
    const item = items.find(i => i.id === id);
    if (item) item.quantity = quantity;
    this.save(items);
  },
  removeItem(id) { this.save(this.getItems().filter(i => i.id !== id)); },
  clear() { this.save([]); },
  getCount() { return this.getItems().reduce((s, i) => s + i.quantity, 0); },
  getSubtotal() { return this.getItems().reduce((s, i) => s + i.price * i.quantity, 0); },
  getTax() { return this.getSubtotal() * parseFloat(localStorage.getItem('taxRate') || '0.08'); },
  getTotal() { return this.getSubtotal() + this.getTax(); },
  refreshUI() {
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      const count = this.getCount();
      el.textContent = count;
      el.classList.toggle('hidden', count === 0);
    });
    document.querySelectorAll('[data-cart-subtotal]').forEach(el => el.textContent = `$${this.getSubtotal().toFixed(2)}`);
    document.querySelectorAll('[data-cart-tax]').forEach(el => el.textContent = `$${this.getTax().toFixed(2)}`);
    document.querySelectorAll('[data-cart-total]').forEach(el => el.textContent = `$${this.getTotal().toFixed(2)}`);
  },
  renderItems(container) {
    if (!container) return;
    const items = this.getItems();
    if (!items.length) {
      container.innerHTML = '<p class="empty-cart-msg">Your cart is empty.</p>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.image_url || '/images/placeholder.png'}" alt="${item.name}">
        <div class="cart-item-info">
          <p class="cart-item-name">${item.name}</p>
          <p class="cart-item-price">$${item.price.toFixed(2)}</p>
          <div class="qty-controls">
            <button class="qty-btn" data-action="minus" data-id="${item.id}">-</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn" data-action="plus" data-id="${item.id}">+</button>
          </div>
        </div>
        <div class="cart-item-right">
          <p class="cart-item-total">$${(item.price * item.quantity).toFixed(2)}</p>
          <button class="remove-item-btn" data-id="${item.id}">Remove</button>
        </div>
      </div>`).join('');

    container.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const current = this.getItems().find(i => i.id === id);
        if (!current) return;
        this.updateQuantity(id, current.quantity + (btn.dataset.action === 'plus' ? 1 : -1));
        this.renderItems(container);
      });
    });

    container.querySelectorAll('.remove-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeItem(parseInt(btn.dataset.id, 10));
        this.renderItems(container);
      });
    });
  }
};
window.Cart = Cart;
