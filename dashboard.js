(() => {
  if (window.top !== window.self) {
    document.body.innerHTML = '<main style="max-width:36rem;margin:15vh auto;padding:2rem;font:16px/1.6 system-ui;text-align:center"><h1>Lobster dashboard</h1><p>For your safety, the dashboard cannot run inside an embedded frame.</p><a href="' +
      window.location.href.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]) +
      '" target="_top" rel="noopener noreferrer">Open the dashboard in its own tab</a></main>';
    return;
  }
  const API = (window.LOBSTER_API_BASE || window.location.origin).replace(/\/+$/, '');
  const SESSION_KEY = 'lobster_dashboard_token';
  const pageNames = {
    overview: 'Home',
    settings: 'Settings',
    roles: 'Role manager',
    welcome: 'Welcome & farewell',
    automod: 'Auto moderation',
    verification: 'Verification',
    logs: 'Audit logs',
    levels: 'Level system',
    replies: 'Auto replies',
    security: 'Security',
    server: 'Server tools'
  };
  const directPages = {
    '/settings': 'settings',
    '/roles': 'roles',
    '/welcome': 'welcome',
    '/automod': 'automod',
    '/verification': 'verification',
    '/logs': 'logs',
    '/levels': 'levels',
    '/replies': 'replies',
    '/security': 'security',
    '/server': 'server'
  };
  const state = {
    user: null,
    guilds: [],
    selectedGuild: null,
    data: null,
    page: directPages[window.location.pathname.replace(/\/+$/, '')] || 'overview',
    toastTimer: null
  };
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const content = document.getElementById('content');
  const guildSelect = document.getElementById('guild-select');
  const toast = document.getElementById('toast');

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function api(path, options = {}) {
    return fetch(`${API}${path}`, {
      credentials: 'omit',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        'ngrok-skip-browser-warning': 'true',
        ...(sessionStorage.getItem(SESSION_KEY) ? { Authorization: `Bearer ${sessionStorage.getItem(SESSION_KEY)}` } : {}),
        ...options.headers
      }
    }).then(async response => {
      if (response.status === 204) return null;
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`The bot API at ${API} did not return JSON. Check that the bot and HTTPS tunnel are running.`);
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(result.error || `Request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return result;
    });
  }

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function showLoginError(message) {
    const error = document.getElementById('login-error');
    error.textContent = message;
    error.hidden = false;
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
  }

  function showLogin(message = '') {
    appView.hidden = true;
    loginView.hidden = false;
    if (message) showLoginError(message);
  }

  function avatarUrl(user) {
    const discriminator = Number((BigInt(user.id) >> 22n) % 6n);
    return user.avatar
      ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${discriminator}.png`;
  }

  function renderUser() {
    document.getElementById('user-menu').innerHTML =
      `<img src="${escapeHTML(avatarUrl(state.user))}" alt="">` +
      `<button type="button" data-action="logout" title="Sign out">Sign out</button>`;
  }

  function renderGuildSelect() {
    if (!state.guilds.length) {
      guildSelect.innerHTML = '<option value="">No servers with Manage Server permission</option>';
      return;
    }
    guildSelect.innerHTML = state.guilds.map(guild =>
      `<option value="${escapeHTML(guild.id)}" ${guild.installed ? '' : 'disabled'}>` +
      `${escapeHTML(guild.name)}${guild.installed ? '' : ' · Lobster not installed'}</option>`
    ).join('');
    if (state.selectedGuild) guildSelect.value = state.selectedGuild;
    else {
      const firstInstalled = state.guilds.find(guild => guild.installed);
      if (firstInstalled) {
        state.selectedGuild = firstInstalled.id;
        guildSelect.value = firstInstalled.id;
      }
    }
  }

  async function loadGuild(guildId) {
    if (!guildId) {
      state.selectedGuild = null;
      state.data = null;
      render();
      return;
    }
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading server settings…</p></div>';
    try {
      state.data = await api(`/api/guilds/${encodeURIComponent(guildId)}`);
      state.selectedGuild = guildId;
      document.getElementById('breadcrumb-server').textContent = state.data.guild.name;
      const shortcut = document.querySelector('.server-shortcut');
      shortcut.querySelector('.server-avatar').textContent = state.data.guild.name.slice(0, 1).toUpperCase();
      shortcut.querySelector('strong').textContent = state.data.guild.name;
      render();
    } catch (error) {
      if (error.status === 401) return showLogin('Your Discord sign-in expired. Please sign in again.');
      showToast(error.message, true);
      content.innerHTML = `<div class="empty-state"><strong>Could not load this server</strong>${escapeHTML(error.message)}</div>`;
    }
  }

  function pageHeading(title, description, action = '') {
    return `<div class="page-heading"><div><p class="eyebrow small">LOBSTER CONTROL PANEL</p><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></div>${action}</div>`;
  }

  function cardHead(title, description = '') {
    return `<div class="card-head"><div><h2>${escapeHTML(title)}</h2>${description ? `<p>${escapeHTML(description)}</p>` : ''}</div></div>`;
  }

  function roleOptions(selected, allowNone = true, noneLabel = 'No role', editableOnly = false) {
    const roles = state.data?.roles || [];
    return `${allowNone ? `<option value="">${escapeHTML(noneLabel)}</option>` : ''}` +
      roles.filter(role => !role.managed && (!editableOnly || role.editable)).map(role =>
        `<option value="${escapeHTML(role.id)}" ${role.id === selected ? 'selected' : ''}>${escapeHTML(role.name)}</option>`
      ).join('');
  }

  function channelOptions(selected, allowNone = true, noneLabel = 'Not set', textOnly = false) {
    const channels = (state.data?.channels || []).filter(channel => !textOnly || channel.type === 'text');
    return `${allowNone ? `<option value="">${escapeHTML(noneLabel)}</option>` : ''}` +
      channels.map(channel =>
        `<option value="${escapeHTML(channel.id)}" ${channel.id === selected ? 'selected' : ''}>` +
        `${channel.category ? `${escapeHTML(channel.category)} / ` : ''}#${escapeHTML(channel.name)}${channel.type === 'announcement' ? ' · announcement' : ''}</option>`
      ).join('');
  }

  function categoryOptions(selected) {
    return '<option value="">No category selected</option>' +
      (state.data?.categories || []).map(category =>
        `<option value="${escapeHTML(category.id)}" ${category.id === selected ? 'selected' : ''}>${escapeHTML(category.name)}</option>`
      ).join('');
  }

  function toggle(name, label, description, checked, extra = '') {
    return `<div class="switch-row"><div class="switch-copy"><strong>${escapeHTML(label)}</strong><small>${escapeHTML(description)}</small></div>` +
      `<label class="switch"><input type="checkbox" name="${escapeHTML(name)}" data-type="boolean" ${checked ? 'checked' : ''} aria-label="${escapeHTML(label)}"><span></span></label>${extra}</div>`;
  }

  function field(name, label, value, type = 'text', help = '', attributes = '') {
    return `<div class="field"><label for="f-${escapeHTML(name)}">${escapeHTML(label)}</label>` +
      `<input id="f-${escapeHTML(name)}" name="${escapeHTML(name)}" type="${escapeHTML(type)}" value="${escapeHTML(value)}" ${attributes}>` +
      `${help ? `<small class="field-help">${escapeHTML(help)}</small>` : ''}</div>`;
  }

  function selectField(name, label, selected, options, help = '') {
    return `<div class="field"><label for="f-${escapeHTML(name)}">${escapeHTML(label)}</label><select id="f-${escapeHTML(name)}" name="${escapeHTML(name)}">${options}</select>` +
      `${help ? `<small class="field-help">${escapeHTML(help)}</small>` : ''}</div>`;
  }

  function saveButton() {
    return '<div class="form-actions"><span class="save-status"></span><button class="button primary" type="submit">Save changes</button></div>';
  }

  function sectionForm(inner, className = '') {
    return `<form class="${className}" data-form="settings">${inner}${saveButton()}</form>`;
  }

  function overviewPage() {
    const { stats, settings, guild } = state.data;
    const features = [
      ['automod', 'Auto moderation', Boolean(settings.automod), 'Message filters and spam protection.'],
      ['welcome', 'Welcome messages', Boolean(settings.welcomeEnabled), 'Greet members when they join.'],
      ['welcome', 'Farewell messages', Boolean(settings.farewellEnabled), 'Send a goodbye when members leave.'],
      ['verification', 'Member verification', Boolean(settings.verificationEnabled), 'Gate new members behind Discord button verification.'],
      ['logs', 'Server event logs', Boolean(settings.eventLogsEnabled), 'Record selected server events.'],
      ['levels', 'Level system', Boolean(settings.levelsEnabled), 'Reward active members with XP.'],
      ['security', 'Join raid protection', Boolean(settings.joinRaidProtection?.enabled), 'Limit bursts of new joins.'],
      ['security', 'Anti-nuke protection', Boolean(settings.antiNuke?.enabled), 'React to configured high-risk server actions.'],
      ['security', 'Minimum account age', Number(settings.minAccountAgeDays) > 0, Number(settings.minAccountAgeDays) > 0 ? `Require accounts to be at least ${settings.minAccountAgeDays} days old.` : 'No account-age restriction configured.'],
      ['security', 'Bot account filter', Boolean(settings.blockBots), 'Block bot accounts from joining.'],
      ['server', 'Counting channel', Boolean(settings.counting), 'Keep a running server count.'],
      ['server', 'Ticket panel', Boolean(settings.ticketChannel), 'Open private support tickets.'],
      ['replies', 'Automatic replies', Object.keys(state.data.autoReplies || {}).length > 0, `${Object.keys(state.data.autoReplies || {}).length} configured.`],
      ['settings', 'Automatic member role', Boolean(settings.autorole), 'Assign a role when members join.']
    ];
    const activeFeatures = features.filter(([, , active]) => active).length;
    const featureRows = features.map(([page, name, active, description]) =>
      `<button class="feature-status" data-page="${page}"><span class="feature-status-dot ${active ? 'is-active' : ''}"></span>` +
      `<span class="feature-status-copy"><strong>${escapeHTML(name)}</strong><small>${escapeHTML(description)}</small></span>` +
      `<span class="feature-status-state">${active ? 'On' : 'Off'}</span></button>`
    ).join('');
    return pageHeading(`Welcome, ${state.user.globalName || state.user.username}`, `Here is what is happening in ${guild.name}.`) +
      `<div class="welcome-banner"><div><p class="eyebrow small">YOUR SERVER IS IN GOOD HANDS</p><h2>Your Lobster control room.</h2><p>Check what is running, jump into a setting, and keep your community welcoming.</p></div><div class="welcome-banner-actions"><button class="button primary" data-page="settings">Review settings →</button><a class="button secondary" href="https://discord.gg/lobster" target="_blank" rel="noopener noreferrer">Get support ↗</a></div></div>` +
      `<div class="grid three quick-grid">` +
      statCard('Server members', Number(stats.members || 0).toLocaleString(), '♙') +
      statCard('Server channels', Number(stats.channels || 0).toLocaleString(), '▤') +
      statCard('Server roles', Number(stats.roles || 0).toLocaleString(), '♧') +
      statCard('Active features', activeFeatures.toString(), '✦') +
      statCard('Commands available', Number(stats.commands || 0).toLocaleString(), '⌘') +
      statCard('Command prefix', settings.prefix || 'l', '›') +
      `</div><div class="grid quick-grid">` +
      quickAction('automod', 'Auto moderation', 'Set up spam and content filters.', '⛨') +
      quickAction('welcome', 'Welcome & farewell', 'Set up join and leave messages.', '✦') +
      quickAction('roles', 'Role manager', 'Edit names and colors for server roles.', '♙') +
      quickAction('verification', 'Verification', 'Configure the member verification panel.', '✓') +
      quickAction('security', 'Security & raid guards', 'Review join protection and anti-nuke controls.', '◈') +
      quickAction('levels', 'Level system', 'Manage XP and level-up announcements.', '↗') +
      quickAction('logs', 'Audit logs', 'Choose which server events Lobster logs.', '▤') +
      quickAction('server', 'Server tools & reaction roles', 'Configure server tools and member-selected roles.', '☷') +
      `</div><section class="card overview-features">${cardHead('Feature status', `${activeFeatures} of ${features.length} features are enabled · Select a feature to configure it.`)}` +
      `<div class="feature-status-grid">${featureRows}</div></section>` +
      `<section class="card overview-bot-status">${cardHead('Lobster status', 'Live status for this selected server.')}` +
      `<p class="muted"><span class="online-dot"></span> Connected to <strong>${escapeHTML(guild.name)}</strong> · Command prefix <strong>${escapeHTML(settings.prefix)}</strong></p></section>`;
  }

  function statCard(label, value, icon) {
    return `<div class="card stats-card"><div class="stat-label">${escapeHTML(label)}</div><div class="stat-value">${escapeHTML(value)}</div><span class="stat-icon">${icon}</span></div>`;
  }

  function quickAction(page, title, description, icon) {
    return `<button class="quick-action" data-page="${page}"><span class="quick-icon">${icon}</span><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></span><span style="margin-left:auto;color:#9aa0aa">→</span></button>`;
  }

  function settingsPage() {
    const s = state.data.settings;
    return pageHeading('General settings', 'Set server-wide defaults for Lobster.') +
      `<div class="grid"><div class="card">${cardHead('Command prefix', 'Choose how members run text commands.')}` +
      sectionForm(field('prefix', 'Prefix', s.prefix, 'text', '1–5 characters, no spaces.', 'maxlength="5" autocomplete="off"'), 'settings-form') +
      `</div><div class="card">${cardHead('Member role', 'Optionally give new members a role when they join.')}` +
      sectionForm(selectField('autorole', 'Automatic member role', s.autorole, roleOptions(s.autorole, true, 'No role', true), 'Lobster needs Manage Roles, and its role must be above this role.'), 'settings-form') +
      `</div><div class="card">${cardHead('Server activity', 'Quick overview of your server.')}` +
      `<p class="muted">${state.data.stats.members.toLocaleString()} members · ${state.data.stats.channels} channels · ${state.data.stats.roles} roles</p>` +
      `<p class="muted">Configure welcomes, moderation, and logging from the sidebar.</p></div></div>`;
  }

  function welcomePage() {
    const s = state.data.settings;
    return pageHeading('Welcome & farewell', 'Create a friendly first impression and say goodbye when members leave.') +
      `<div class="grid"><div class="card">${cardHead('Welcome message', 'Sent when a new member joins.')}` +
      sectionForm(toggle('welcomeEnabled', 'Welcome messages', 'Send a welcome card when a member joins.', s.welcomeEnabled) +
        selectField('welcomeChannel', 'Welcome channel', s.welcomeChannel, channelOptions(s.welcomeChannel)) +
        field('welcomeTitle', 'Card title', s.welcomeTitle, 'text', 'Maximum 256 characters.', 'maxlength="256"') +
        `<div class="field"><label for="f-welcomeMessage">Message</label><textarea id="f-welcomeMessage" name="welcomeMessage" maxlength="2000">${escapeHTML(s.welcomeMessage)}</textarea><small class="field-help">Placeholders: {user}, {username}, {server}, {membercount}, {created}, {joined}, {id}.</small></div>` +
        `<div class="form-row">${field('welcomeImage', 'Image URL', s.welcomeImage || '', 'url', 'Optional HTTPS or HTTP image.')}${field('welcomeColor', 'Embed color', s.welcomeColor || '#FF6B35', 'color')}</div>`) +
      `</div><div class="card">${cardHead('Farewell message', 'Sent when a member leaves.')}` +
      sectionForm(toggle('farewellEnabled', 'Farewell messages', 'Send a goodbye when a member leaves.', s.farewellEnabled) +
        selectField('farewellChannel', 'Farewell channel', s.farewellChannel, channelOptions(s.farewellChannel)) +
        `<div class="field"><label for="f-farewellMessage">Message</label><textarea id="f-farewellMessage" name="farewellMessage" maxlength="2000">${escapeHTML(s.farewellMessage)}</textarea><small class="field-help">Placeholders: {user}, {username}, {server}, {membercount}, {created}, {joined}, {id}.</small></div>`) +
      `</div></div>`;
  }

  const filters = [
    ['links', 'Block links', 'Remove messages containing HTTP or HTTPS links.'],
    ['invites', 'Block Discord invites', 'Remove messages containing Discord invite links.'],
    ['advertisements', 'Block common ad phrases', 'Remove messages containing common promotional phrases.'],
    ['spam', 'Flood protection', 'Remove messages when a member exceeds the message rate limit.'],
    ['duplicate', 'Repeated messages', 'Remove repeated copies from the same member within a time window.'],
    ['caps', 'Excessive capitals', 'Remove messages that exceed the uppercase percentage threshold.'],
    ['emoji', 'Excessive emoji', 'Remove messages containing more emoji than the allowed limit.'],
    ['mentions', 'Excessive mentions', 'Remove messages with too many user and role mentions.'],
    ['longLines', 'Too many lines', 'Remove messages with more lines than the configured limit.'],
    ['longMessages', 'Character limit', 'Remove messages that exceed the maximum character count.'],
    ['imageSpam', 'Image spam', 'Remove image posts after the per-minute limit is exceeded.']
  ];

  const automodThresholds = {
    spam: [['spamLimit', 'Messages allowed', '3–20 messages.', 3, 20], ['spamWindowSeconds', 'Time window (seconds)', '2–60 seconds.', 2, 60]],
    duplicate: [['duplicateLimit', 'Matching messages allowed', '2–5 copies.', 2, 5], ['duplicateWindowSeconds', 'Time window (seconds)', '10–3,600 seconds.', 10, 3600]],
    caps: [['capsPercentage', 'Uppercase threshold (%)', '50–100%. Messages under 12 letters are ignored.', 50, 100]],
    emoji: [['emojiLimit', 'Emoji allowed', '3–30 emoji.', 3, 30]],
    mentions: [['mentionsLimit', 'Mentions allowed', '2–10 user and role mentions.', 2, 10]],
    longLines: [['longLinesLimit', 'Lines allowed', '2–20 lines.', 2, 20]],
    longMessages: [['longMessagesLimit', 'Characters allowed', '100–4,000 characters.', 100, 4000]],
    imageSpam: [['imageSpamLimit', 'Images allowed per minute', '2–20 images.', 2, 20]]
  };

  function automodPage() {
    const s = state.data.settings;
    const rules = s.automodRules;
    const ruleCards = filters.map(([key, title, description]) => {
      const controls = (automodThresholds[key] || []).map(([controlKey, label, help, min, max]) =>
        field(`automodRules.${controlKey}`, label, rules[controlKey], 'number', help,
          `data-type="number" min="${min}" max="${max}" required`)
      ).join('');
      return `<article class="automod-rule-card"><div class="automod-rule-top">${toggle(`automodRules.${key}`, title, description, rules[key])}` +
        `<span class="automod-rule-state ${rules[key] ? 'is-on' : ''}">${rules[key] ? 'On' : 'Off'}</span></div>` +
        `${controls ? `<details class="automod-rule-settings"><summary>Configure rule</summary><div class="automod-rule-controls">${controls}</div></details>` : ''}</article>`;
    }).join('');
    return pageHeading('Auto moderation', 'Choose exactly what Lobster filters, then tune each rule to fit your community.') +
      `<div class="card">${cardHead('Message moderation', 'Staff with Manage Messages or Administrator are exempt from these filters.')}` +
      sectionForm(toggle('automod', 'Enable AutoMod', 'Apply the selected rules to member messages.', s.automod) +
        `<div class="automod-rules-grid">${ruleCards}` +
        `<article class="automod-rule-card automod-words-card"><div class="automod-rule-top"><div class="switch-copy"><strong>Custom blocked words</strong><small>Remove messages containing any phrase in your list, including profanity you choose to block.</small></div>` +
        `<span class="automod-rule-state ${rules.blockedWords.length ? 'is-on' : ''}">${rules.blockedWords.length ? `${rules.blockedWords.length} added` : 'Not set'}</span></div>` +
        `<div class="field"><label for="f-automodRules-blockedWords">Blocked words and phrases</label><textarea id="f-automodRules-blockedWords" name="automodRules.blockedWords" maxlength="5099" placeholder="Enter up to 50 comma-separated words or phrases">${escapeHTML(rules.blockedWords.join(', '))}</textarea><small class="field-help">Up to 50 entries, maximum 100 characters each. Matching ignores capitalization. Add language-specific terms yourself.</small></div></article></div>` +
        `<div class="hint automod-note">The advertising filter matches a small built-in phrase list; use Custom blocked words for your server’s language. AutoMod removes matching messages and posts a short notice.</div>`) +
      `</div>`;
  }

  const logCategories = [
    ['general', 'General'], ['moderation', 'Moderation'], ['members', 'Members'],
    ['messages', 'Message events'], ['channels', 'Channels'], ['roles', 'Roles'],
    ['voice', 'Voice'], ['emojis', 'Emoji'], ['levels', 'Levels'], ['security', 'Security']
  ];

  function logsPage() {
    const s = state.data.settings;
    const rows = logCategories.map(([key, label]) =>
      `<tr><td>${escapeHTML(label)}</td><td><label class="switch"><input type="checkbox" name="eventLogTypes.${key}" data-type="boolean" ${s.eventLogTypes[key] ? 'checked' : ''} aria-label="Enable ${escapeHTML(label)} logs"><span></span></label></td>` +
      `<td><select name="eventLogChannels.${key}" aria-label="${escapeHTML(label)} log channel">${channelOptions(s.eventLogChannels[key], true, 'Use main channel')}</select></td></tr>`
    ).join('');
    return pageHeading('Audit logs', 'Choose what Lobster reports and where each event goes.') +
      `<div class="card">${cardHead('Event logging', 'Message edits and deletions are logged without copying message contents.')}` +
      sectionForm(toggle('eventLogsEnabled', 'Enable server event logs', 'Turn all configured event log categories on or off.', s.eventLogsEnabled) +
        selectField('auditLogChannel', 'Main log channel', s.auditLogChannel, channelOptions(s.auditLogChannel), 'Dedicated category channels override this destination.') +
        `<div class="table-wrap"><table class="category-table"><thead><tr><th>Event category</th><th>On</th><th>Destination</th></tr></thead><tbody>${rows}</tbody></table></div>`) +
      `</div>`;
  }

  function levelsPage() {
    const s = state.data.settings;
    return pageHeading('Level system', 'Reward activity with XP and celebrate level-ups.') +
      `<div class="grid"><div class="card">${cardHead('Chat levels', 'Members earn XP from messages, with a one-minute cooldown.')}` +
      sectionForm(toggle('levelsEnabled', 'Enable levels', 'Track member XP and levels in this server.', s.levelsEnabled) +
        selectField('levelUpChannel', 'Level-up announcements', s.levelUpChannel, channelOptions(s.levelUpChannel), 'Leave empty to announce in the channel where the member earned XP.')) +
      `</div><div class="card">${cardHead('How it works')}` +
      `<p class="muted">Members earn a random 15–25 XP at most once per minute. Use <strong>/level</strong> to view progress and <strong>/leaderboard</strong> for the top ten.</p>` +
      `<p class="muted">Level records are stored locally with your server’s Lobster settings.</p></div></div>`;
  }

  function securityPage() {
    const s = state.data.settings;
    return pageHeading('Security', 'Filter risky joins and protect important server changes.') +
      `<div class="grid"><div class="card">${cardHead('Join raid protection', 'Limit bursts of new joins without blocking the first wave.')}` +
      sectionForm(toggle('joinRaidProtection.enabled', 'Enable join rate limit', 'Kick additional joiners after your server exceeds the limit.', s.joinRaidProtection.enabled) +
        `<div class="form-row"><div class="field"><label for="f-joinRaidLimit">Maximum joins</label><input id="f-joinRaidLimit" name="joinRaidProtection.limit" type="number" min="2" max="100" data-type="number" value="${escapeHTML(s.joinRaidProtection.limit)}"></div>` +
        `<div class="field"><label for="f-joinRaidWindow">Time window (seconds)</label><input id="f-joinRaidWindow" name="joinRaidProtection.windowSeconds" type="number" min="5" max="300" data-type="number" value="${escapeHTML(s.joinRaidProtection.windowSeconds)}"></div></div>` +
        `<div class="hint warning">When the limit is exceeded, Lobster kicks each additional eligible newcomer until the time window passes. Enable only if you accept the risk of false positives during a legitimate influx. Requires Kick Members.</div>`) +
      `</div><div class="card">${cardHead('Account and bot filter', 'Apply these checks to each new member who joins.')}` +
      sectionForm(`<div class="field"><label for="f-minAccountAgeDays">Minimum account age (days)</label><input id="f-minAccountAgeDays" name="minAccountAgeDays" type="number" min="0" max="3650" data-type="number" value="${escapeHTML(s.minAccountAgeDays)}"><small class="field-help">Accounts younger than this are kicked. Set 0 to disable.</small></div>` +
        toggle('blockBots', 'Block bot accounts', 'Kick newly joined bots. Use carefully with other bots.', s.blockBots)) +
      `</div><div class="card">${cardHead('Anti-nuke protection', 'Kick a non-exempt member after a burst of protected server changes.')}` +
      sectionForm(toggle('antiNukeEnabled', 'Enable anti-nuke', 'Requires View Audit Log and Kick Members permissions for Lobster.', s.antiNuke.enabled) +
        `<div class="form-row"><div class="field"><label for="f-antiNukeLimit">Action limit</label><input id="f-antiNukeLimit" name="antiNukeLimit" type="number" min="2" max="100" data-type="number" value="${escapeHTML(s.antiNuke.limit)}"></div>` +
        `<div class="field"><label for="f-antiNukeWindowSeconds">Time window (seconds)</label><input id="f-antiNukeWindowSeconds" name="antiNukeWindowSeconds" type="number" min="2" max="3600" data-type="number" value="${escapeHTML(s.antiNuke.windowSeconds)}"></div></div>` +
        `<div class="protection-scope"><strong>Actions monitored</strong><div class="protection-tags"><span>Role changes</span><span>Channel changes</span><span>Member bans and kicks</span><span>Member role changes</span><span>Webhook changes</span><span>Emoji changes</span></div><small class="field-help">All listed actions share the same threshold. The server owner and selected trusted roles are exempt.</small></div>` +
        `<div class="field"><label for="f-antiNukeExemptRoleIds">Trusted exempt roles</label><select id="f-antiNukeExemptRoleIds" name="antiNukeExemptRoleIds" multiple size="5">${(state.data.roles || []).filter(role => !role.managed).map(role => `<option value="${escapeHTML(role.id)}" ${s.antiNuke.exemptRoleIds.includes(role.id) ? 'selected' : ''}>${escapeHTML(role.name)}</option>`).join('')}</select><small class="field-help">Members with any selected role are excluded from anti-nuke enforcement. Use Ctrl/⌘ to select multiple roles.</small></div>` +
        `<div class="hint warning">Anti-nuke is disabled by default. Configure trusted staff and verify Lobster’s role hierarchy before enabling it.</div>`) +
      `</div></div>`;
  }

  function verificationPage() {
    const s = state.data.settings;
    return pageHeading('Member verification', 'Require new members to verify in Discord before receiving the verified role.') +
      `<div class="grid"><div class="card">${cardHead('Verification setup', 'This is Discord-native button verification. It does not verify a person’s real-world identity or an external account.')}` +
      sectionForm(toggle('verificationEnabled', 'Enable verification', 'Assign the unverified role to new members and let them claim the verified role from the panel.', s.verificationEnabled) +
        selectField('verificationChannel', 'Verification panel channel', s.verificationChannel, channelOptions(s.verificationChannel, true, 'Select a channel')) +
        selectField('verificationRole', 'Verified role', s.verificationRole, roleOptions(s.verificationRole, true, 'Select a role', true)) +
        selectField('unverifiedRole', 'Unverified role', s.unverifiedRole, roleOptions(s.unverifiedRole, true, 'Select a role', true),
          'Assigned to new members while they are waiting to verify. Configure restricted channel permissions for this role in Discord.') +
        selectField('quarantineRole', 'Quarantine role (optional)', s.quarantineRole, roleOptions(s.quarantineRole, true, 'No quarantine role', true),
          'Removed after successful verification, if the member has it.') +
        selectField('verificationLogChannel', 'Verification log channel (optional)', s.verificationLogChannel, channelOptions(s.verificationLogChannel, true, 'No log channel')) +
        `<input type="hidden" name="verificationLanguage" value="en">`) +
      `<div class="form-actions"><button class="button secondary" type="button" data-action="verification-test-log">Send test log</button>` +
      `<button class="button primary" type="button" data-action="verification-panel">Publish / update panel</button></div>` +
      `<p class="field-help">Save settings and enable verification before publishing. Lobster needs Manage Roles and permission to send embeds in the selected channels.</p></div>` +
      `<div class="card">${cardHead('External integrations', 'Hangar RP whitelist and network ban-sharing options are not available yet.')}` +
      `<p class="muted">Lobster has no configured Hangar API or alliance integration. These features are intentionally not presented as working toggles and will stay unavailable until a supported integration is added.</p>` +
      `<div class="hint">For reliable access control, also set your Discord channel permissions so the unverified role cannot view member-only channels.</div></div></div>`;
  }

  function serverPage() {
    const s = state.data.settings;
    return pageHeading('Server tools', 'Configure counting, support tickets, and member-selected roles.') +
      `<div class="grid"><div class="card">${cardHead('Counting channel', 'Members count upward one message at a time.')}` +
      sectionForm(toggle('counting', 'Enable counting', 'Track a single sequential number in the selected channel.', s.counting) +
        selectField('countingChannel', 'Counting channel', s.countingChannel, channelOptions(s.countingChannel)) +
        `<div class="hint">The current count is ${escapeHTML(state.data.settings.lastCount || 0)}. The next valid number must be posted by a different member.</div>`) +
      `</div><div class="card">${cardHead('Ticket system', 'Configure the channel, support role, and private transcripts.')}` +
      sectionForm(selectField('ticketChannel', 'Ticket panel channel', s.ticketChannel, channelOptions(s.ticketChannel)) +
        selectField('ticketCategory', 'Ticket category', s.ticketCategory, categoryOptions(s.ticketCategory)) +
        selectField('ticketAdminRole', 'Support staff role', s.ticketAdminRole, roleOptions(s.ticketAdminRole)) +
        selectField('ticketTranscriptChannel', 'Private transcript channel', s.ticketTranscriptChannel, channelOptions(s.ticketTranscriptChannel, true, 'Transcripts disabled', true),
          'Transcripts include ticket messages and attachment URLs. Keep this channel private to staff.')) +
      `<div class="hint">Use <strong>/ticket-panel</strong> in Discord to create or update the public ticket panel and configure its text.</div>` +
      `</div><div class="card">${cardHead('Emoji reaction roles', 'Let members choose roles by reacting to a Discord message.')}` +
      `<p class="muted">Create a reaction role from Discord using <strong>/reactionrole add</strong>. Choose the channel, message, emoji, and role in the command options.</p>` +
      `<div class="hint">Use <strong>/reactionrole list</strong> to review a message’s role mappings, or <strong>/reactionrole remove</strong> to remove one. Lobster needs Manage Roles, Read Message History, and Add Reactions, and its highest role must be above the roles it assigns.</div>` +
      `</div></div>`;
  }

  function roleManagerPage() {
    const roles = state.data.roles || [];
    const editableRoles = roles.filter(role => role.editable && !role.managed);
    const cards = roles.map(role => {
      const unavailable = !role.editable || role.managed;
      return `<form class="role-card" data-role-form="${escapeHTML(role.id)}">` +
        `<div class="role-name"><span class="role-color" style="background:${escapeHTML(role.color)}"></span>` +
        `<input class="role-input" name="name" aria-label="Role name" value="${escapeHTML(role.name)}" maxlength="100" ${unavailable ? 'disabled' : ''}>` +
        `${role.managed ? '<span class="bot-tag">Managed</span>' : ''}</div>` +
        `<input class="role-color-input" name="color" type="color" aria-label="Role color" value="${/^#[\da-f]{6}$/i.test(role.color) ? escapeHTML(role.color) : '#99AAB5'}" ${unavailable ? 'disabled' : ''}>` +
        `<div class="role-edit-actions">${unavailable ? '<span class="bot-tag">Not editable</span>' : '<button class="button secondary small" type="submit">Save</button><button class="button danger small" type="button" data-action="delete-role" data-id="' + escapeHTML(role.id) + '">Delete</button>'}</div>` +
        `</form>`;
    }).join('');
    return pageHeading('Role manager', 'Edit existing server role names and colors, or create a new role.') +
      `<div class="grid"><div class="card">${cardHead(`Server roles · ${roles.length}`, 'Role permission settings are not changed by this dashboard.')}` +
      `${cards || '<div class="empty-state">No editable roles are available.</div>'}</div>` +
      `<div><div class="card">${cardHead('Create a role', 'New roles are created without extra permissions.')}` +
      `<form data-form="create-role">${field('name', 'Role name', '', 'text', 'Maximum 100 characters.', 'maxlength="100" required')}` +
      `<div class="field"><label for="new-role-color">Role color</label><input id="new-role-color" name="color" type="color" value="#FF6B35"></div>` +
      `<div class="form-actions"><button class="button primary" type="submit">Create role</button></div></form></div>` +
      `<div class="card warning" style="margin-top:17px">${cardHead('Role hierarchy matters')}` +
      `<p class="muted">You need Manage Roles in Discord. Lobster’s highest role and your own highest role must be above the role you edit. Managed roles and roles above Lobster are read-only. Deleting a role removes it from every member who has it.</p>` +
      `<p class="muted">To move Lobster’s role, change the bot role order in Server Settings → Roles in Discord.</p></div></div></div>`;
  }

  function repliesPage() {
    const replies = state.data.autoReplies || {};
    const list = Object.entries(replies).map(([trigger, response]) =>
      `<div class="switch-row"><div class="switch-copy"><strong>${escapeHTML(trigger)}</strong><small>${escapeHTML(response)}</small></div><button class="button danger small" data-action="delete-reply" data-trigger="${escapeHTML(trigger)}">Remove</button></div>`
    ).join('');
    return pageHeading('Auto replies', 'Reply automatically when messages contain a configured phrase.') +
      `<div class="grid"><div class="card">${cardHead(`Configured replies · ${Object.keys(replies).length}`, 'Matching is case-insensitive; the longest matching phrase is used.')}` +
      `${list || '<div class="empty-state"><strong>No auto replies yet</strong>Add a trigger and response to get started.</div>'}</div>` +
      `<div class="card">${cardHead('Add an auto reply')}` +
      `<form data-form="create-reply">${field('trigger', 'Trigger phrase', '', 'text', 'Maximum 100 characters.', 'maxlength="100" required')}` +
      `<div class="field"><label for="reply-response">Response</label><textarea id="reply-response" name="response" maxlength="1500" required></textarea><small class="field-help">Placeholders: {user} and {server}.</small></div>` +
      `<div class="form-actions"><button class="button primary" type="submit">Add reply</button></div></form></div></div>`;
  }

  const pageRenderers = {
    overview: overviewPage,
    settings: settingsPage,
    roles: roleManagerPage,
    welcome: welcomePage,
    automod: automodPage,
    verification: verificationPage,
    logs: logsPage,
    levels: levelsPage,
    replies: repliesPage,
    security: securityPage,
    server: serverPage
  };

  function render() {
    document.querySelectorAll('.nav-item').forEach(button =>
      button.classList.toggle('active', button.dataset.page === state.page)
    );
    if (!state.data) {
      const hasInstalled = state.guilds.some(guild => guild.installed);
      content.innerHTML = `<div class="empty-state"><strong>${hasInstalled ? 'Choose a server' : 'No installed servers found'}</strong>` +
        `${hasInstalled ? 'Select an installed server from the menu above.' : 'Invite Lobster to a server where you have Manage Server permission, then reload this page.'}</div>`;
      return;
    }
    document.getElementById('breadcrumb-server').textContent = state.data.guild.name;
    content.innerHTML = pageRenderers[state.page]?.() || pageRenderers.overview();
  }

  async function saveSettings(form) {
    const payload = {};
    for (const input of form.querySelectorAll('[name]')) {
      if (input.disabled) continue;
      const name = input.name;
      let value;
      if (input.type === 'checkbox') value = input.checked;
      else if (input.multiple) value = [...input.selectedOptions].map(option => option.value);
      else if (input.dataset.type === 'number') value = Number(input.value);
      else value = input.value;

      if (name.startsWith('automodRules.')) {
        payload.automodRules ||= {};
        const key = name.slice('automodRules.'.length);
        payload.automodRules[key] = key === 'blockedWords'
          ? value.split(',').map(word => word.trim()).filter(Boolean)
          : value;
      } else if (name.startsWith('eventLogTypes.')) {
        payload.eventLogTypes ||= {};
        payload.eventLogTypes[name.slice('eventLogTypes.'.length)] = value;
      } else if (name.startsWith('eventLogChannels.')) {
        payload.eventLogChannels ||= {};
        payload.eventLogChannels[name.slice('eventLogChannels.'.length)] = value || null;
      } else if (name.startsWith('joinRaidProtection.')) {
        payload.joinRaidProtection ||= {};
        payload.joinRaidProtection[name.slice('joinRaidProtection.'.length)] = value;
      } else if (['autorole', 'welcomeChannel', 'farewellChannel', 'auditLogChannel', 'levelUpChannel', 'countingChannel', 'ticketChannel', 'ticketCategory', 'ticketAdminRole', 'ticketTranscriptChannel', 'verificationChannel', 'verificationRole', 'unverifiedRole', 'quarantineRole', 'verificationLogChannel'].includes(name)) {
        payload[name] = value || null;
      } else {
        payload[name] = value;
      }
    }
    const button = form.querySelector('button[type=submit]');
    const status = form.querySelector('.save-status');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const result = await api(`/api/guilds/${encodeURIComponent(state.selectedGuild)}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      state.data.settings = result.settings;
      if (status) status.textContent = 'Saved';
      showToast('Settings saved.');
      if (state.page === 'overview') render();
    } catch (error) {
      showToast(error.message, true);
      if (status) status.textContent = '';
    } finally {
      button.disabled = false;
      button.textContent = 'Save changes';
    }
  }

  async function handleSubmit(event) {
    const form = event.target.closest('form');
    if (!form) return;
    event.preventDefault();
    const submitButton = form.querySelector('button[type=submit]');
    if (form.dataset.form === 'settings') return saveSettings(form);
    submitButton.disabled = true;
    try {
      if (form.dataset.form === 'create-role') {
        const data = new FormData(form);
        await api(`/api/guilds/${encodeURIComponent(state.selectedGuild)}/roles`, {
          method: 'POST',
          body: JSON.stringify({ name: data.get('name'), color: data.get('color') })
        });
        showToast('Role created.');
      } else if (form.dataset.roleForm) {
        const data = new FormData(form);
        await api(`/api/guilds/${encodeURIComponent(state.selectedGuild)}/roles/${encodeURIComponent(form.dataset.roleForm)}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: data.get('name'), color: data.get('color') })
        });
        showToast('Role updated.');
      } else if (form.dataset.form === 'create-reply') {
        const data = new FormData(form);
        await api(`/api/guilds/${encodeURIComponent(state.selectedGuild)}/auto-replies`, {
          method: 'POST',
          body: JSON.stringify({ trigger: data.get('trigger'), response: data.get('response') })
        });
        showToast('Auto reply added.');
      }
      await loadGuild(state.selectedGuild);
    } catch (error) {
      showToast(error.message, true);
      submitButton.disabled = false;
    }
  }

  async function handleClick(event) {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state.page = pageButton.dataset.page;
      const route = state.page === 'overview' ? '/dashboard' : `/${state.page}`;
      if (window.location.pathname !== route) history.pushState({}, '', route);
      document.getElementById('sidebar').classList.remove('open');
      render();
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (['verification-panel', 'verification-test-log'].includes(action.dataset.action)) {
      action.disabled = true;
      try {
        const endpoint = action.dataset.action === 'verification-panel'
          ? 'verification-panel'
          : 'verification-test-log';
        const result = await api(`/api/guilds/${encodeURIComponent(state.selectedGuild)}/${endpoint}`, { method: 'POST', body: '{}' });
        showToast(result.message || 'Verification action completed.');
      } catch (error) {
        showToast(error.message, true);
      } finally {
        action.disabled = false;
      }
    } else if (action.dataset.action === 'logout') {
      try {
        await api('/api/auth/logout', { method: 'POST' });
        sessionStorage.removeItem(SESSION_KEY);
        state.user = null;
        state.guilds = [];
        state.data = null;
        showLogin();
      } catch (error) {
        showToast(`Could not sign out: ${error.message}`, true);
      }
    } else if (action.dataset.action === 'delete-role') {
      if (!confirm('Delete this server role? This removes it from every member who has it.')) return;
      action.disabled = true;
      try {
        await api(`/api/guilds/${encodeURIComponent(state.selectedGuild)}/roles/${encodeURIComponent(action.dataset.id)}`, { method: 'DELETE' });
        showToast('Role deleted.');
        await loadGuild(state.selectedGuild);
      } catch (error) {
        action.disabled = false;
        showToast(error.message, true);
      }
    } else if (action.dataset.action === 'delete-reply') {
      try {
        const result = await api(`/api/guilds/${encodeURIComponent(state.selectedGuild)}/auto-replies`, {
          method: 'DELETE',
          body: JSON.stringify({ trigger: action.dataset.trigger })
        });
        state.data.autoReplies = result.autoReplies;
        render();
        showToast('Auto reply removed.');
      } catch (error) {
        showToast(error.message, true);
      }
    }
  }

  async function start() {
    document.getElementById('login-button').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await api('/api/auth/login-url');
        window.location.assign(result.authorizationUrl);
      } catch (error) {
        showLoginError(`Could not start Discord sign-in: ${error.message}`);
        button.disabled = false;
      }
    });
    document.getElementById('mobile-menu').addEventListener('click', () =>
      document.getElementById('sidebar').classList.toggle('open')
    );
    document.getElementById('navigation').addEventListener('click', handleClick);
    content.addEventListener('click', handleClick);
    content.addEventListener('change', event => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === 'checkbox'
        && input.name.startsWith('automodRules.')) {
        const badge = input.closest('.automod-rule-card')?.querySelector('.automod-rule-state');
        if (badge) {
          badge.textContent = input.checked ? 'On' : 'Off';
          badge.classList.toggle('is-on', input.checked);
        }
      }
    });
    content.addEventListener('input', event => {
      const input = event.target;
      if (input instanceof HTMLTextAreaElement && input.name === 'automodRules.blockedWords') {
        const badge = input.closest('.automod-rule-card')?.querySelector('.automod-rule-state');
        const count = input.value.split(',').map(word => word.trim()).filter(Boolean).length;
        if (badge) {
          badge.textContent = count ? `${count} added` : 'Not set';
          badge.classList.toggle('is-on', count > 0);
        }
      }
    });
    content.addEventListener('submit', handleSubmit);
    document.getElementById('user-menu').addEventListener('click', handleClick);
    guildSelect.addEventListener('change', () => loadGuild(guildSelect.value));
    window.addEventListener('popstate', () => {
      state.page = directPages[window.location.pathname.replace(/\/+$/, '')] || 'overview';
      if (state.data) render();
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        guildSelect.focus();
      }
    });

    if (new URLSearchParams(window.location.search).has('error')) {
      showLoginError('Discord sign-in did not complete. Please try again.');
      history.replaceState({}, '', window.location.pathname);
    }
    try {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const exchangeCode = fragment.get('auth_code');
      if (exchangeCode) {
        history.replaceState({}, '', window.location.pathname + window.location.search);
        const exchanged = await api('/api/auth/exchange', {
          method: 'POST',
          body: JSON.stringify({ code: exchangeCode })
        });
        sessionStorage.setItem(SESSION_KEY, exchanged.token);
      } else if (window.location.hash) {
        history.replaceState({}, '', window.location.pathname + window.location.search);
      }
      const health = await api('/api/health');
      if (!health.configured) {
        document.getElementById('login-button').disabled = true;
        return showLoginError('The dashboard API is online but Discord OAuth is not configured on the bot host yet.');
      }
      const result = await api('/api/auth/me');
      if (!result.user) return showLogin();
      state.user = result.user;
      showApp();
      renderUser();
      state.guilds = await api('/api/guilds');
      renderGuildSelect();
      await loadGuild(state.selectedGuild);
    } catch (error) {
      showLogin(error.message === 'Failed to fetch'
        ? `Could not reach the Lobster dashboard API at ${API}. Make sure the bot and HTTPS tunnel are running.`
        : error.message);
    }
  }

  start();
})();
