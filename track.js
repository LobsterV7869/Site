(function () {
  try {
    if (window.__lobsterTracked) return;
    window.__lobsterTracked = true;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: location.pathname,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    });
  } catch (_) {}
})();