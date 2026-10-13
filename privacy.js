(function () {
  try {
    fetch('/api/config')
      .then(function (response) {
        return response.json();
      })
      .then(function (config) {
        if (!config) return;
        document.querySelectorAll('[data-config="retention"]').forEach(function (el) {
          el.textContent = config.retentionDays;
        });
        document.querySelectorAll('[data-config="hashing"]').forEach(function (el) {
          el.textContent = config.hashingEnabled
            ? 'stored as a salted SHA-256 hash'
            : 'stored as-is';
        });
        document.querySelectorAll('[data-config="contact"]').forEach(function (el) {
          if (config.contactEmail) {
            el.textContent = config.contactEmail;
            if (el.tagName === 'A') el.setAttribute('href', 'mailto:' + config.contactEmail);
          }
        });
      })
      .catch(function () {});
  } catch (_) {}
})();