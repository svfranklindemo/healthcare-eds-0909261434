import { readBlockConfig } from '../../scripts/aem.js';

const ICONS_PATH = '/icons';

const FEATURE_CARDS = [
  {
    id: 'device-security',
    title: 'Device security',
    status: 'QUICK SCAN | LIVEUPDATE',
    statusClass: '',
    buttonLabel: 'START SCAN',
    image: `${ICONS_PATH}/bodea-device-security.png`,
  },
  {
    id: 'id-theft',
    title: 'ID Theft Protection',
    status: 'THREAT FOUND',
    statusClass: 'warning',
    buttonLabel: 'VIEW ALERT',
    image: `${ICONS_PATH}/bodea-theft-protection.png`,
  },
  {
    id: 'secure-vpn',
    title: 'Secure VPN',
    status: 'PROTECTED',
    statusClass: 'success',
    buttonLabel: 'MANAGE',
    image: `${ICONS_PATH}/bodea-secure-vpn.png`,
  },
  {
    id: 'cloud-backup',
    title: 'Cloud Backup',
    status: 'WARNING',
    statusClass: 'warning',
    buttonLabel: 'RUN BACKUP',
    image: `${ICONS_PATH}/bodea-cloud-backup.png`,
  },
  {
    id: 'password-manager',
    title: 'Password Manager',
    status: 'EXTENSION INSTALLED',
    statusClass: 'success',
    buttonLabel: 'OPEN VAULT',
    image: `${ICONS_PATH}/bodea-password-manager.png`,
  },
];

const NAV_ITEMS = [
  { id: 'antivirus', label: 'Antivirus', configKey: 'antivirus-url' },
  { id: 'firewall', label: 'Firewall', configKey: 'firewall-url' },
  { id: 'encryption', label: 'File Encryption', configKey: 'encryption-url' },
  { id: 'log-management', label: 'Log Management', configKey: 'log-management-url' },
];

function createTrainingHeader(config) {
  const header = document.createElement('div');
  header.className = 'bsav-training-header';
  const websiteUrl = config['bodea-website-url'] || '#';
  header.innerHTML = `
    <div class="bsav-training-header__inner">
      <img class="bsav-training-header__logo" src="${ICONS_PATH}/bodea-secure-logo.png" alt="Bodea logo" height="40">
      <h4 class="bsav-training-header__title">Training Page</h4>
      <a class="bsav-btn bsav-btn--primary" href="${websiteUrl}">Bodea Website</a>
    </div>
  `;
  return header;
}

function createSidebar(variant, config) {
  const companyName = config['company-name'] || 'Towsend CO';
  const stepNumber = NAV_ITEMS.findIndex((item) => item.id === variant) + 1;

  const navItems = NAV_ITEMS.map((item) => {
    const isActive = item.id === variant;
    const href = config[item.configKey] || '#';
    return `<li class="bsav-sidebar__nav-item${isActive ? ' bsav-sidebar__nav-item--active' : ''}">
      <a href="${href}">${item.label}</a>
    </li>`;
  }).join('');

  const sidebar = document.createElement('aside');
  sidebar.className = 'bsav-sidebar';
  sidebar.innerHTML = `
    <div class="bsav-sidebar__company">
      <h2 class="bsav-sidebar__company-name">${companyName}</h2>
      <p class="bsav-sidebar__meta">SUBSCRIPTION STATUS: <strong>ACTIVE</strong></p>
      <p class="bsav-sidebar__meta">SOFTWARE VERSION: <strong>2.0.8 (TRIAL)</strong></p>
    </div>
    <nav class="bsav-sidebar__nav" aria-label="Trial navigation">
      <ul>${navItems}</ul>
    </nav>
    <button class="bsav-btn bsav-btn--cta bsav-sidebar__complete-btn">
      I have completed Trial ${stepNumber}
    </button>
  `;
  return sidebar;
}

function createAntivirusContent() {
  const content = document.createElement('div');
  content.className = 'bsav-content bsav-content--antivirus';
  content.innerHTML = `
    <h2 class="bsav-content__heading">Your computer is safe</h2>
    <div class="bsav-status-grid">
      <div class="bsav-status-item">
        <p class="bsav-status-item__label">Last scan:</p>
        <h3 class="bsav-status-item__value bsav-status-item__value--success">2 days ago</h3>
      </div>
      <div class="bsav-status-item">
        <p class="bsav-status-item__label">Available updates:</p>
        <h3 class="bsav-status-item__value bsav-status-item__value--success">None. You are up to date!</h3>
      </div>
    </div>
    <button class="bsav-btn bsav-btn--primary">Run a quick scan</button>
  `;
  return content;
}

function createFirewallContent() {
  const content = document.createElement('div');
  content.className = 'bsav-content bsav-content--firewall';
  content.innerHTML = `
    <h2 class="bsav-content__heading">SYSTEM STATUS: OK</h2>
    <h2 class="bsav-content__subheading bsav-content__subheading--warning">136 Suspicious actions blocked</h2>
    <p class="bsav-content__desc">Protect your environment from hackers and unauthorized intrusions.
      Make your network invisible to others on the Internet.</p>
    <div class="bsav-firewall-columns">
      <div class="bsav-firewall-status">
        <ul class="bsav-checklist">
          <li class="bsav-checklist__item bsav-checklist__item--on">
            <span class="bsav-checklist__icon">&#10003;</span> Security: ON
          </li>
          <li class="bsav-checklist__item bsav-checklist__item--on">
            <span class="bsav-checklist__icon">&#10003;</span> Antivirus: ON
          </li>
          <li class="bsav-checklist__item bsav-checklist__item--off">
            <span class="bsav-checklist__icon bsav-checklist__icon--warn">&#9888;</span> Password Manager: OFF
          </li>
        </ul>
        <button class="bsav-btn bsav-btn--primary">SCAN NOW</button>
      </div>
      <div class="bsav-firewall-toggles">
        <ul class="bsav-toggle-list">
          ${[
    ['Smart Firewall', true],
    ['Intrusion Prevention', true],
    ['Email Protection', true],
    ['Safe Surfing', true],
    ['Download Intelligence', false],
  ].map(([label, checked]) => `
            <li class="bsav-toggle-item">
              <label class="bsav-toggle">
                <input type="checkbox"${checked ? ' checked' : ''}>
                <span class="bsav-toggle__slider"></span>
              </label>
              <span class="bsav-toggle-item__label">${label}</span>
            </li>`).join('')}
        </ul>
      </div>
    </div>
  `;
  return content;
}

function createEncryptionContent() {
  const content = document.createElement('div');
  content.className = 'bsav-content bsav-content--encryption';
  content.innerHTML = `
    <h2 class="bsav-content__heading">File encryption</h2>
    <div class="bsav-encryption-panel">
      <div class="bsav-encryption-form">
        <div class="bsav-encryption-form__row">
          <input class="bsav-input" type="password" placeholder="MASTER PASSWORD" aria-label="Master password">
          <button class="bsav-btn bsav-btn--primary">SAVE</button>
        </div>
        <a class="bsav-link" href="#">Change Master Password</a>
        <label class="bsav-checkbox">
          <input type="checkbox">
          <span>Ask Master Password for &lsquo;Lock Files&rsquo; only</span>
        </label>
      </div>
      <ul class="bsav-encryption-options">
        <li><a class="bsav-link bsav-link--arrow" href="#">Encrypt the system partition or entire system drive</a></li>
        <li><a class="bsav-link bsav-link--arrow" href="#">Encrypt the non-system partition/drive</a></li>
        <li><a class="bsav-link bsav-link--arrow" href="#">Create an encrypted file container</a></li>
      </ul>
    </div>
  `;
  return content;
}

function createLogManagementContent() {
  const rows = [
    ['24-01-2023', '16:12', 'WARNING', '10.0.11.234', 'Unauthorised access detected'],
    ['24-01-2023', '16:11', 'INFO', '10.0.12.112', 'SUCCESFULL LOGIN'],
    ['24-01-2023', '16:09', 'INFO', '10.0.12.112', 'PASSWORD CHANGED for user: tlewis'],
    ['24-01-2023', '15:55', 'INFO', '10.0.56.200', 'FILE ENCRYPTION FINISHED'],
    ['24-01-2023', '15:53', 'WARNING', '10.0.01.152', 'SCANNING DETECTED'],
    ['24-01-2023', '16:11', 'INFO', '10.0.12.112', 'SUCCESFULL LOGIN'],
  ];

  const tableRows = rows.map(([date, time, level, host, msg]) => {
    const isWarning = level === 'WARNING';
    return `<tr class="${isWarning ? 'bsav-table__row--warning' : ''}">
      <td>${date}</td>
      <td>${time}</td>
      <td><span class="bsav-badge bsav-badge--${level.toLowerCase()}">${level}</span></td>
      <td>${host}</td>
      <td>${msg}</td>
    </tr>`;
  }).join('');

  const content = document.createElement('div');
  content.className = 'bsav-content bsav-content--log-management';
  content.innerHTML = `
    <h2 class="bsav-content__heading">Events</h2>
    <div class="bsav-table-wrapper">
      <table class="bsav-table">
        <thead>
          <tr>
            <th>Date</th><th>Time</th><th>Level</th><th>Hostname</th><th>Message</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <a class="bsav-link bsav-link--more" href="#">Load more &rsaquo;&rsaquo;</a>
    <div class="bsav-analytics">
      <div class="bsav-analytics__grid">
        <div class="bsav-analytics__item">
          <h4 class="bsav-analytics__title">MAINFRAME PROCESSES</h4>
          <div class="bsav-analytics__chart" aria-label="Mainframe processes chart"></div>
          <a class="bsav-link bsav-link--more" href="#">Learn more &rsaquo;&rsaquo;</a>
        </div>
        <div class="bsav-analytics__item">
          <h4 class="bsav-analytics__title">USAGE MAP</h4>
          <div class="bsav-analytics__chart" aria-label="Usage map chart"></div>
          <a class="bsav-link bsav-link--more" href="#">Learn more &rsaquo;&rsaquo;</a>
        </div>
      </div>
    </div>
  `;
  return content;
}

function createFeatureCards() {
  const section = document.createElement('div');
  section.className = 'bsav-feature-cards';

  FEATURE_CARDS.forEach((card) => {
    const el = document.createElement('div');
    el.className = 'bsav-feature-card';
    el.id = `bsav-card-${card.id}`;
    el.innerHTML = `
      <div class="bsav-feature-card__image">
        ${card.image ? `<img src="${card.image}" alt="${card.title}">` : ''}
      </div>
      <h4 class="bsav-feature-card__title">${card.title}</h4>
      <p class="bsav-feature-card__status${card.statusClass ? ` bsav-feature-card__status--${card.statusClass}` : ''}">${card.status}</p>
      <button class="bsav-btn bsav-btn--outline">${card.buttonLabel}</button>
    `;
    section.appendChild(el);
  });

  return section;
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const variant = (config.variant || 'antivirus').toLowerCase().trim();

  block.innerHTML = '';
  block.classList.add(`bsav--${variant}`);

  // Training header bar
  block.appendChild(createTrainingHeader(config));

  // Two-column layout: sidebar + main
  const layout = document.createElement('div');
  layout.className = 'bsav-layout';
  layout.appendChild(createSidebar(variant, config));

  const main = document.createElement('div');
  main.className = 'bsav-main';

  switch (variant) {
    case 'firewall':
      main.appendChild(createFirewallContent());
      break;
    case 'encryption':
      main.appendChild(createEncryptionContent());
      break;
    case 'log-management':
      main.appendChild(createLogManagementContent());
      break;
    default:
      main.appendChild(createAntivirusContent());
  }

  main.appendChild(createFeatureCards());
  layout.appendChild(main);
  block.appendChild(layout);
}
