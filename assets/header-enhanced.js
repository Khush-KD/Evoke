/**
 * header-enhanced.js
 * Handles: mini cart drawer, announcement bar dismiss, wishlist count,
 *          swipe-to-close gesture, animated hamburger, cart AJAX
 */

/* =============================================
   ANNOUNCEMENT BAR
   ============================================= */
(function () {
    const bar = document.getElementById('header-announcement');
    if (!bar) return;

    const STORAGE_KEY = 'dawn-announcement-dismissed';
    if (sessionStorage.getItem(STORAGE_KEY)) {
        bar.classList.add('is-hidden');
    }

    const closeBtn = bar.querySelector('[data-announcement-close]');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            bar.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
            bar.style.maxHeight = bar.offsetHeight + 'px';
            requestAnimationFrame(() => {
                bar.style.maxHeight = '0';
                bar.style.opacity = '0';
                bar.style.overflow = 'hidden';
            });
            setTimeout(() => bar.classList.add('is-hidden'), 320);
            sessionStorage.setItem(STORAGE_KEY, '1');
        });
    }
})();

/* =============================================
   MINI CART DRAWER
   ============================================= */
class MiniCartDrawer {
    constructor() {
        this.drawer = document.getElementById('mini-cart-drawer');
        this.overlay = document.getElementById('mini-cart-overlay');
        if (!this.drawer || !this.overlay) return;

        this.body = document.getElementById('mini-cart-body');
        this.subtotalEl = document.getElementById('mini-cart-subtotal');

        this.bindEvents();
        this.initSwipeClose();
    }

    bindEvents() {
        // Trigger buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-mini-cart-trigger]')) {
                e.preventDefault();
                this.open();
            }
        });

        // Close buttons
        document.querySelectorAll('[data-mini-cart-close]').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });

        this.overlay.addEventListener('click', () => this.close());

        // Remove item buttons (delegated)
        this.drawer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-remove-key]');
            if (removeBtn) {
                const key = removeBtn.dataset.removeKey;
                this.removeItem(key);
            }
        });

        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) this.close();
        });
    }

    initSwipeClose() {
        let startX = 0;
        this.drawer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        }, { passive: true });

        this.drawer.addEventListener('touchend', (e) => {
            const diffX = e.changedTouches[0].clientX - startX;
            if (diffX > 60) this.close(); // swipe right to close
        }, { passive: true });
    }

    open() {
        this.drawer.classList.add('is-open');
        this.overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        this.drawer.setAttribute('aria-hidden', 'false');
        if (!this._cartLoaded) {
            this.refresh();
            this._cartLoaded = true;
        }
    }

    async removeItem(key) {
        // existing code...
        this._cartLoaded = false; // invalidate cache after mutation
    }

    close() {
        this.drawer.classList.remove('is-open');
        this.overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        this.drawer.setAttribute('aria-hidden', 'true');
    }

    isOpen() {
        return this.drawer.classList.contains('is-open');
    }

    async refresh() {
        try {
            const res = await fetch('/cart.js');
            const cart = await res.json();
            this.renderCart(cart);
        } catch (err) {
            console.error('Mini cart refresh failed:', err);
        }
    }

    async removeItem(key) {
        try {
            const res = await fetch('/cart/change.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: key, quantity: 0 })
            });
            const cart = await res.json();
            this.renderCart(cart);
            this.updateCartBubble(cart.item_count);
        } catch (err) {
            console.error('Remove item failed:', err);
        }
    }

    renderCart(cart) {
        if (!this.body) return;

        if (cart.item_count === 0) {
            this.body.innerHTML = '<p class="mini-cart-drawer__empty">Your cart is empty.</p>';
            if (this.subtotalEl) this.subtotalEl.textContent = this.formatMoney(0);
            return;
        }

        const items = cart.items.map(item => `
      <div class="mini-cart-item" data-key="${item.key}">
        <img src="${item.image ? item.image.replace('http:', 'https:') : ''}" alt="${this.escHtml(item.title)}" width="70" height="70" loading="lazy">
        <div>
          <p class="mini-cart-item__title">${this.escHtml(item.product_title)}</p>
          ${item.variant_title ? `<p class="mini-cart-item__price">${this.escHtml(item.variant_title)}</p>` : ''}
          <p class="mini-cart-item__price">Qty: ${item.quantity} · ${this.formatMoney(item.line_price)}</p>
        </div>
        <button class="mini-cart-item__remove" data-remove-key="${item.key}" aria-label="Remove ${this.escHtml(item.title)}">&#x2715;</button>
      </div>
    `).join('');

        this.body.innerHTML = items;

        if (this.subtotalEl) {
            this.subtotalEl.textContent = this.formatMoney(cart.total_price);
        }
    }

    updateCartBubble(count) {
        const bubbles = document.querySelectorAll('.cart-count-bubble span[aria-hidden]');
        bubbles.forEach(b => b.textContent = count);
        const icons = document.querySelectorAll('.header__icon--cart');
        icons.forEach(icon => {
            const cartIcon = icon.querySelector('.svg-wrapper');
            // Could update icon state here
        });
    }

    formatMoney(cents) {
        const amount = (cents / 100).toFixed(2);
        return window.Shopify?.currency?.active
            ? `${window.Shopify.currency.active} ${amount}`
            : `$${amount}`;
    }

    escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

/* =============================================
   WISHLIST COUNT (localStorage-based)
   ============================================= */
(function () {
    const countEl = document.getElementById('wishlist-count');
    if (!countEl) return;

    function updateWishlistCount() {
        try {
            const wishlist = JSON.parse(localStorage.getItem('dawn-wishlist') || '[]');
            if (wishlist.length > 0) {
                countEl.textContent = wishlist.length;
                countEl.style.display = 'flex';
            } else {
                countEl.style.display = 'none';
            }
        } catch (e) { }
    }

    updateWishlistCount();
    window.addEventListener('wishlist-updated', updateWishlistCount);
})();

/* =============================================
   INIT
   ============================================= */
new MiniCartDrawer();
