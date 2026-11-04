/*
 * The menu. The only JavaScript on this site.
 *
 * It has to be usable from a keyboard, which means more than a class toggle:
 * Escape closes it, focus moves into it when it opens and back to the button
 * when it shuts, and focus is held inside it while it is open. Without that
 * last part, tabbing past the last link walks invisibly through the page
 * underneath.
 *
 * The menu is hidden with `visibility`, not just opacity, so its links leave
 * the tab order entirely when it is shut.
 */
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('site-menu');
  var close = document.querySelector('.menu-close');
  if (!toggle || !menu || !close) return;

  var lastFocused = null;

  function focusable() {
    return Array.prototype.slice.call(
      menu.querySelectorAll('a[href], button:not([disabled])')
    );
  }

  function openMenu() {
    lastFocused = document.activeElement;
    menu.setAttribute('data-open', 'true');
    toggle.setAttribute('aria-expanded', 'true');
    // Stops the page behind from scrolling under a full screen menu.
    document.body.style.overflow = 'hidden';
    var first = focusable()[0];
    if (first) first.focus();
  }

  function closeMenu() {
    menu.setAttribute('data-open', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
  }

  function isOpen() {
    return menu.getAttribute('data-open') === 'true';
  }

  toggle.addEventListener('click', openMenu);
  close.addEventListener('click', closeMenu);

  document.addEventListener('keydown', function (event) {
    if (!isOpen()) return;

    if (event.key === 'Escape') {
      closeMenu();
      return;
    }

    if (event.key !== 'Tab') return;

    // Hold focus inside the menu while it is open.
    var items = focusable();
    if (items.length === 0) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // A hairline under the header once the page has moved, so the sticky bar
  // separates from content it is sitting over.
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
