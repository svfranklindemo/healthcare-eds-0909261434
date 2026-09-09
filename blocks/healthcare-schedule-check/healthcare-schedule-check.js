import { readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_TIME_SLOTS = ['9 AM', '10 AM', '11 AM', '12 AM'];
const DEFAULT_DAYS_SHOWN = 3;
const DEFAULT_MOBILE_DAYS_SHOWN = 1;
const DEFAULT_DOCTOR_IMAGE = '/content/dam/we-healthcare-assets/en/images/doctors/dr-verma-md.png';
const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const NAV_ARROW_ICON = `
  <svg viewBox="0 0 36 36" focusable="false" aria-hidden="true" role="img">
    <path fill-rule="evenodd" d="M24,18v0a1.988,1.988,0,0,1-.585,1.409l-7.983,7.98a2,2,0,1,1-2.871-2.772l.049-.049L19.181,18l-6.572-6.57a2,2,0,0,1,2.773-2.87l.049.049,7.983,7.98A1.988,1.988,0,0,1,24,18Z"></path>
  </svg>
`;

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function parseList(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function updateCheckupTime(selectedTime) {
  if (typeof window === 'undefined' || typeof window.updateDataLayer !== 'function' || !selectedTime) return;
  window.updateDataLayer({
    onboarding: {
      checkup: {
        time: selectedTime,
      },
    },
  });
}

function buildSlotPicker(config, onChange) {
  const selected = { value: '' };
  const dailyOptions = parseList(config['time-slots'], DEFAULT_TIME_SLOTS);
  let daysShown = parseInt(config['days-shown'], 10) || DEFAULT_DAYS_SHOWN;
  const mobileDaysShown = parseInt(config['mobile-days-shown'], 10) || DEFAULT_MOBILE_DAYS_SHOWN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slotData = {};

  if (window.innerWidth < 900) {
    daysShown = mobileDaysShown;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'hsc-slot-picker';

  const content = document.createElement('div');
  content.className = 'hsc-slot-picker-content';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'hsc-slot-nav hsc-slot-nav-prev';
  prevBtn.setAttribute('aria-label', 'Previous days');
  prevBtn.innerHTML = NAV_ARROW_ICON;

  const columnsEl = document.createElement('div');
  columnsEl.className = 'hsc-slot-columns';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'hsc-slot-nav';
  nextBtn.setAttribute('aria-label', 'Next days');
  nextBtn.innerHTML = NAV_ARROW_ICON;

  content.append(prevBtn, columnsEl, nextBtn);
  wrapper.append(content);

  let dateOffset = 0;

  function getOrCreateDayData(date) {
    const key = date.toDateString();
    if (!slotData[key]) {
      slotData[key] = {
        key,
        dayName: SHORT_DAY_NAMES[date.getDay()],
        day: date.getDate(),
        monthName: SHORT_MONTH_NAMES[date.getMonth()],
        options: dailyOptions.map((opt) => ({
          value: `${key} - ${opt}`,
          label: opt,
          disabled: Math.random() > 0.7,
        })),
      };
    }
    return slotData[key];
  }

  function render() {
    columnsEl.innerHTML = '';
    for (let i = 0; i < daysShown; i += 1) {
      const date = addDays(today, dateOffset + i);
      const col = getOrCreateDayData(date);

      const colEl = document.createElement('div');
      colEl.className = 'hsc-slot-column';

      const header = document.createElement('div');
      header.className = 'hsc-slot-col-header';
      header.innerHTML = `<strong>${col.dayName}</strong><em>${col.day} ${col.monthName}</em>`;
      colEl.append(header);

      col.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.label;
        btn.className = 'hsc-slot-option'
          + (opt.disabled ? ' is-disabled' : '')
          + (selected.value === opt.value ? ' is-selected' : '');
        if (!opt.disabled) {
          btn.addEventListener('click', () => {
            selected.value = opt.value;
            onChange?.(opt.value);
            render();
          });
        }
        colEl.append(btn);
      });

      columnsEl.append(colEl);
    }
    prevBtn.disabled = dateOffset <= 0;
  }

  prevBtn.addEventListener('click', () => {
    dateOffset = Math.max(0, dateOffset - daysShown);
    render();
  });

  nextBtn.addEventListener('click', () => {
    dateOffset += daysShown;
    render();
  });

  render();
  return wrapper;
}

export default function decorate(block) {
  const config = readBlockConfig(block) || {};
  block.textContent = '';

  const customClass = config['custom-class']?.trim();
  if (customClass) block.classList.add(...customClass.split(/\s+/));

  const titleText = (config.title || 'Schedule 1st check-up').toString().trim();
  const pickDateText = (config['pick-date-label'] || 'Pick the date').toString().trim();
  const doctorName = (config['doctor-name'] || 'Dr. Verma, MD').toString().trim();
  const doctorRole = (config['doctor-role'] || 'Doctor').toString().trim();
  const doctorImage = (config['doctor-image'] || DEFAULT_DOCTOR_IMAGE).toString().trim();
  const profileLabel = (config['doctor-profile-label'] || "Doctor's Profile").toString().trim();
  const profileUrl = (config['doctor-profile-url'] || '#').toString().trim();

  const title = document.createElement('h2');
  title.className = 'hsc-title';
  title.textContent = titleText;

  const card = document.createElement('div');
  card.className = 'hsc-doctor-card';
  const rating = 5;
  card.innerHTML = `
    <div class="hsc-doctor-photo"><img src="${doctorImage}" alt="Doctor"></div>
    <div class="hsc-doctor-info">
      <div class="hsc-doctor-rating" aria-label="${rating} out of 5 stars">${'★'.repeat(rating)}</div>
      <p class="hsc-doctor-title">${doctorRole}</p>
      <p class="hsc-doctor-name">${doctorName}</p>
      <a class="hsc-doctor-profile-link" href="${profileUrl}">${profileLabel}</a>
    </div>
  `;

  const pickDateLabel = document.createElement('p');
  pickDateLabel.className = 'hsc-pick-date-label';
  pickDateLabel.textContent = pickDateText;

  const slotPicker = buildSlotPicker(config, (selectedTime) => {
    block.dataset.selectedTime = selectedTime;
    updateCheckupTime(selectedTime);
    block.dispatchEvent(new CustomEvent('healthcare-schedule-check:change', {
      bubbles: true,
      detail: { time: selectedTime },
    }));
  });

  block.append(title, card, pickDateLabel, slotPicker);
}
