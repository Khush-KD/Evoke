/**
 * featured-collection-enhanced.js
 *
 * Enhancements for the Featured Collection section:
 *   - Tag filter tabs (client-side, no full-page reload)
 *   - Countdown timer
 *   - Slider autoplay with pause-on-hover
 *   - Slider progress bar
 *   - Wishlist button (dispatch events for app integration)
 *   - Performant: IntersectionObserver for lazy init
 *   - Accessible: live region updates, focus management
 *
 */

(function () {
  'use strict';

  /* ─── UTILITIES ──────────────────────────────────────────────────────────── */

  /**
   * Run a callback when the element first enters the viewport.
   * Falls back to immediate execution if IntersectionObserver unavailable.
   */
  function onVisible(el, cb, options = {}) {
    if (!('IntersectionObserver' in window)) { cb(); return; }
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { observer.disconnect(); cb(); }
      });
    }, { rootMargin: '100px', threshold: 0, ...options });
    io.observe(el);
  }

  /** Debounce a function. */
  function debounce(fn, wait = 100) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  /** Pad a number to two digits. */
  const pad = n => String(Math.max(0, n)).padStart(2, '0');

  /* ─── TAG FILTER TABS ────────────────────────────────────────────────────── */

  class FcTagFilter {
    constructor(section) {
      this.section  = section;
      this.sectionId = section.dataset.id;
      this.tabs     = [...section.querySelectorAll('.fc-tab')];
      this.grid     = section.querySelector(`#fc-grid-${this.sectionId}`);
      this.emptyEl  = section.querySelector(`#fc-empty-${this.sectionId}`);

      if (!this.tabs.length || !this.grid) return;

      this.allItems = [...this.grid.querySelectorAll('.fc-grid__item[data-tags]')];
      this._bindTabs();
    }

    _bindTabs() {
      this.tabs.forEach(tab => {
        tab.addEventListener('click', () => this._activateTab(tab));
        tab.addEventListener('keydown', e => this._handleKeyNav(e));
      });
    }

    _handleKeyNav(e) {
      const { tabs } = this;
      const idx = tabs.indexOf(e.currentTarget);
      if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); }
      if (e.key === 'Home')       { e.preventDefault(); tabs[0].focus(); }
      if (e.key === 'End')        { e.preventDefault(); tabs[tabs.length - 1].focus(); }
    }

    _activateTab(tab) {
      this.tabs.forEach(t => {
        t.classList.remove('fc-tab--active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('fc-tab--active');
      tab.setAttribute('aria-selected', 'true');

      const activeTag = tab.dataset.tag;
      this._filterItems(activeTag);
    }

    _filterItems(tag) {
      let visible = 0;

      this.allItems.forEach(item => {
        const tags      = (item.dataset.tags || '').trim().split(/\s+/);
        const isMatch   = tag === 'all' || tags.includes(tag);

        if (isMatch) {
          item.removeAttribute('aria-hidden');
          item.classList.remove('fc-grid__item--hidden');
          visible++;
        } else {
          item.setAttribute('aria-hidden', 'true');
          item.classList.add('fc-grid__item--hidden');
        }
      });

      /* Empty state */
      if (this.emptyEl) {
        this.emptyEl.hidden = visible > 0;
      }

      /* Announce filter result to screen readers */
      const announcer = this.section.querySelector('.fc-sr-announcer');
      if (announcer) announcer.textContent = `${visible} product${visible === 1 ? '' : 's'} shown.`;
    }
  }

  /* ─── COUNTDOWN TIMER ────────────────────────────────────────────────────── */

  class FcCountdown {
    constructor(el) {
      this.el        = el;
      this.endRaw    = el.dataset.countdownEnd; // "YYYY-MM-DD HH:MM"
      this.endDate   = this._parse(this.endRaw);

      if (!this.endDate || isNaN(this.endDate)) return;

      this.daysEl    = el.querySelector('[data-unit="days"]');
      this.hoursEl   = el.querySelector('[data-unit="hours"]');
      this.minsEl    = el.querySelector('[data-unit="minutes"]');
      this.secsEl    = el.querySelector('[data-unit="seconds"]');

      this._tick();
      this._interval = setInterval(() => this._tick(), 1000);
    }

    /**
     * Parse "YYYY-MM-DD HH:MM" into a local-time Date.
     * Using a manual parse avoids timezone ambiguity of new Date(string).
     */
    _parse(str) {
      if (!str) return null;
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
      if (!m) return null;
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    }

    _tick() {
      const diff = this.endDate - Date.now();

      if (diff <= 0) {
        clearInterval(this._interval);
        this._update(0, 0, 0, 0);
        this.el.setAttribute('aria-label', 'Sale has ended');
        return;
      }

      const s = Math.floor(diff / 1000);
      const days  = Math.floor(s / 86400);
      const hours = Math.floor((s % 86400) / 3600);
      const mins  = Math.floor((s % 3600) / 60);
      const secs  = s % 60;

      this._update(days, hours, mins, secs);
    }

    _update(d, h, m, s) {
      if (this.daysEl)  this.daysEl.textContent  = pad(d);
      if (this.hoursEl) this.hoursEl.textContent  = pad(h);
      if (this.minsEl)  this.minsEl.textContent   = pad(m);
      if (this.secsEl)  this.secsEl.textContent   = pad(s);
    }

    destroy() { clearInterval(this._interval); }
  }

  /* ─── SLIDER AUTOPLAY + PROGRESS BAR ─────────────────────────────────────── */

  class FcSliderAutoplay {
    constructor(section, sliderEl) {
      this.section   = section;
      this.sliderEl  = sliderEl; // <slider-component>
      this.sectionId = section.dataset.id;
      this.speed     = parseInt(section.dataset.autoplaySpeed, 10) || 4000;

      this.progressBar = section.querySelector(`#fc-progress-${this.sectionId}`);
      this.prevBtn     = sliderEl.querySelector('.slider-button--prev');
      this.nextBtn     = sliderEl.querySelector('.slider-button--next');

      this._paused    = false;
      this._timer     = null;
      this._startTime = null;
      this._elapsed   = 0;

      this._bindPause();
      this._start();
    }

    _start() {
      this._startTime = performance.now();
      this._elapsed   = 0;
      this._clearTimer();

      this._timer = setInterval(() => {
        if (!this._paused) this._advance();
      }, this.speed);

      if (this.progressBar) this._animateProgress();
    }

    _advance() {
      if (this.nextBtn && !this.nextBtn.disabled) {
        this.nextBtn.click();
      } else {
        // Wrap to first
        const grid = this.section.querySelector(`#fc-grid-${this.sectionId}`);
        if (grid) {
          const firstSlide = grid.querySelector('.slider__slide');
          if (firstSlide) firstSlide.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      if (this.progressBar) {
        this.progressBar.style.width = '0%';
        this._animateProgress();
      }
    }

    _animateProgress() {
      if (!this.progressBar) return;
      const start  = performance.now();
      const speed  = this.speed;
      const bar    = this.progressBar;

      const raf = (now) => {
        if (this._paused) { this._rafId = requestAnimationFrame(raf); return; }
        const pct = Math.min(((now - start) / speed) * 100, 100);
        bar.style.width = `${pct}%`;
        if (pct < 100) this._rafId = requestAnimationFrame(raf);
      };

      cancelAnimationFrame(this._rafId);
      this._rafId = requestAnimationFrame(raf);
    }

    _bindPause() {
      const pauseEvents  = ['mouseenter', 'focusin', 'touchstart'];
      const resumeEvents = ['mouseleave', 'focusout', 'touchend'];

      pauseEvents.forEach(ev => {
        this.section.addEventListener(ev, () => { this._paused = true; }, { passive: true });
      });
      resumeEvents.forEach(ev => {
        this.section.addEventListener(ev, () => { this._paused = false; }, { passive: true });
      });

      // Pause when tab/window is hidden
      document.addEventListener('visibilitychange', () => {
        this._paused = document.hidden;
      });
    }

    _clearTimer() { clearInterval(this._timer); }

    destroy() {
      this._clearTimer();
      cancelAnimationFrame(this._rafId);
    }
  }

  /* ─── WISHLIST BUTTON ─────────────────────────────────────────────────────── */

  class FcWishlist {
    constructor(section) {
      this.section   = section;
      this.storageKey = 'fc_wishlist';
      this.saved     = this._load();

      this._bindButtons();
      this._syncUI();
    }

    _bindButtons() {
      this.section.addEventListener('click', e => {
        const btn = e.target.closest('.fc-wishlist-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const id     = btn.dataset.productId;
        const inList = this.saved.has(id);

        if (inList) {
          this.saved.delete(id);
          btn.classList.remove('fc-wishlist-btn--active');
          btn.setAttribute('aria-pressed', 'false');
        } else {
          this.saved.add(id);
          btn.classList.add('fc-wishlist-btn--active');
          btn.setAttribute('aria-pressed', 'true');
          this._animateHeart(btn);
        }

        this._save();

        /**
         * Dispatch a custom event that wishlist apps (Growave, Wishlist King,
         * Hulk Wishlist, etc.) can listen for. Apps should listen for:
         *   window.addEventListener('fc:wishlist:change', handler)
         */
        window.dispatchEvent(new CustomEvent('fc:wishlist:change', {
          bubbles: true,
          detail: {
            productId: id,
            action:    inList ? 'remove' : 'add',
            wishlist:  [...this.saved],
          }
        }));
      });
    }

    _syncUI() {
      this.section.querySelectorAll('.fc-wishlist-btn').forEach(btn => {
        const id = btn.dataset.productId;
        if (this.saved.has(id)) {
          btn.classList.add('fc-wishlist-btn--active');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.setAttribute('aria-pressed', 'false');
        }
      });
    }

    _animateHeart(btn) {
      btn.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.35)' },
        { transform: 'scale(1)' },
      ], { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    }

    _load() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        return new Set(raw ? JSON.parse(raw) : []);
      } catch { return new Set(); }
    }

    _save() {
      try { localStorage.setItem(this.storageKey, JSON.stringify([...this.saved])); }
      catch { /* quota exceeded or private browsing */ }
    }
  }

  /* ─── SECTION INITIALISER ────────────────────────────────────────────────── */

  function initSection(sectionEl) {
    const sectionId = sectionEl.dataset.id;
    if (!sectionId) return;

    /* Inject a live region for screen reader announcements */
    if (!sectionEl.querySelector('.fc-sr-announcer')) {
      const announcer = document.createElement('span');
      announcer.className = 'fc-sr-announcer visually-hidden';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      sectionEl.appendChild(announcer);
    }

    /* Tag filter */
    new FcTagFilter(sectionEl);

    /* Countdown */
    const countdownEl = sectionEl.querySelector(`#fc-countdown-${sectionId}`);
    if (countdownEl) new FcCountdown(countdownEl);

    /* Autoplay */
    const autoplay = sectionEl.dataset.autoplay === 'true';
    const sliderEl = sectionEl.querySelector('.fc-slider slider-component, .fc-slider');
    if (autoplay && sliderEl) new FcSliderAutoplay(sectionEl, sliderEl);

    /* Wishlist */
    if (sectionEl.querySelector('.fc-wishlist-btn')) new FcWishlist(sectionEl);
  }

  /* ─── BOOT ────────────────────────────────────────────────────────────────── */

  function boot() {
    document.querySelectorAll('.fc-inner[data-id]').forEach(sectionEl => {
      /* Lazy-init: wait until the section scrolls near the viewport */
      onVisible(sectionEl, () => initSection(sectionEl));
    });
  }

  /* Re-init on Shopify theme editor section events */
  document.addEventListener('shopify:section:load', e => {
    const sectionEl = e.target.querySelector('.fc-inner[data-id]');
    if (sectionEl) initSection(sectionEl);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
