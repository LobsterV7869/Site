(function () {
  var STORAGE_KEY = 'lobster_privacy_choice';
  var retention = 30;

  function send() {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: location.pathname, referrer: document.referrer || null }),
        keepalive: true,
      }).catch(function () {});
    } catch (_) {}
  }

  function readChoice() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function saveChoice(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  }

  function removeBanner() {
    var existing = document.getElementById('lobster-consent');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function show() {
    if (document.getElementById('lobster-consent') || !document.body) return;

    var box = document.createElement('div');
    box.id = 'lobster-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Privacy notice');
    box.setAttribute('aria-live', 'polite');
    box.style.cssText = [
      'position:fixed',
      'left:16px',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'max-width:560px',
      'margin:0 auto',
      'padding:16px 18px',
      'background:#12122a',
      'color:#e8e8f4',
      'border:1px solid #2b2b4a',
      'border-radius:14px',
      'box-shadow:0 12px 40px rgba(0,0,0,.45)',
      'font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    ].join(';');

    box.innerHTML =
      '<strong style="display:block;margin-bottom:6px;font-size:15px;color:#fff">Your privacy</strong>' +
      '<span>We log your IP address, country, the page you visit, your browser, and the referrer to keep this site secure, prevent abuse, and count traffic. Records are kept up to ' +
      '<span id="lobster-consent-retention">' +
      retention +
      '</span> days. See our ' +
      '<a href="/privacy" style="color:#8ab4ff;text-decoration:underline">privacy notice</a>.</span>' +
      '<div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end">' +
      '<button type="button" data-consent="decline" style="padding:9px 16px;border-radius:9px;border:1px solid #3a3a5c;background:transparent;color:#c9c9de;font:inherit;cursor:pointer">Decline</button>' +
      '<button type="button" data-consent="accept" style="padding:9px 16px;border-radius:9px;border:1px solid #5b7cff;background:#5b7cff;color:#fff;font:inherit;font-weight:600;cursor:pointer">Accept</button>' +
      '</div>';

    document.body.appendChild(box);

    var accept = box.querySelector('[data-consent="accept"]');
    var decline = box.querySelector('[data-consent="decline"]');
    if (accept) {
      accept.addEventListener('click', function () {
        saveChoice('accepted');
        removeBanner();
        send();
      });
    }
    if (decline) {
      decline.addEventListener('click', function () {
        saveChoice('declined');
        removeBanner();
      });
    }
  }

  var choice = readChoice();
  if (choice === 'accepted') {
    send();
    return;
  }
  if (choice === 'declined') {
    return;
  }

  try {
    fetch('/api/config')
      .then(function (response) {
        return response.json();
      })
      .then(function (config) {
        if (config && config.retentionDays) {
          retention = config.retentionDays;
          var el = document.getElementById('lobster-consent-retention');
          if (el) el.textContent = retention;
        }
      })
      .catch(function () {});
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();