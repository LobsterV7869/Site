// Lobster dashboard API configuration.
//
// The dashboard is a static site, so the API base URL is chosen at runtime:
//   - On localhost it points at the local bot API (development).
//   - Everywhere else it points at the stable public API domain (production).
//
// Replace PRODUCTION_API_BASE with the HTTPS URL of your deployed Lobster API
// (for example https://api.your-domain.example). Never point this at a
// temporary tunnel or embed any secret here.
(function () {
  'use strict';

  var PRODUCTION_API_BASE = 'https://147.15.145.250.sslip.io';

  var host = window.location.hostname;
  var isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

  window.LOBSTER_API_BASE = (isLocal ? 'http://localhost:3000' : PRODUCTION_API_BASE).replace(/\/+$/, '');
})();
