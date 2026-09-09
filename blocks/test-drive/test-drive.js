import { readBlockConfig } from '../../scripts/aem.js';
import { normalizeAemPath } from '../../scripts/scripts.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync, fetchButtonDataSheet } from '../../scripts/form-data-layer.js';

const DEFAULT_TIME_SLOTS = ['9 AM', '10 AM', '11 AM'];
const DEFAULT_DAYS_SHOWN = 3;
const NAV_ARROW_ICON = `
  <svg viewBox="0 0 36 36" class="td-slot-picker-nav-icon" focusable="false" aria-hidden="true" role="img">
    <path fill-rule="evenodd" d="M24,18v0a1.988,1.988,0,0,1-.585,1.409l-7.983,7.98a2,2,0,1,1-2.871-2.772l.049-.049L19.181,18l-6.572-6.57a2,2,0,0,1,2.773-2.87l.049.049,7.983,7.98A1.988,1.988,0,0,1,24,18Z"></path>
  </svg>
`;

const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const VARIANTS = {
  'test-drive': {
    formTitle: 'Schedule test drive',
    submitLabel: 'Schedule arrival',
    successMessage: 'Thank you! Your test drive has been scheduled. We will confirm your appointment shortly.',
    showAddressSection: true,
    dataLayerKey: 'testDrive',
  },
  'schedule-appointment': {
    formTitle: 'Schedule an appointment',
    submitLabel: 'Schedule appointment',
    successMessage: 'Thank you! Your appointment has been scheduled. We will confirm shortly.',
    showAddressSection: false,
    dataLayerKey: 'appointment',
  },
};

function normalizeVariant(value) {
  return String(value || 'test-drive').trim().toLowerCase();
}

function isTruthy(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function applyButtonConfigToSubmitButton(block, config) {
  const submitButton = block.querySelector("form button[type='submit']");
  if (!submitButton) return;
  const eventType = config.buttoneventtype ?? config['button-event-type'];
  if (eventType && String(eventType).trim()) submitButton.dataset.buttonEventType = String(eventType).trim();
  const webhookUrl = config.buttonwebhookurl ?? config['button-webhook-url'];
  if (webhookUrl && String(webhookUrl).trim()) submitButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid ?? config['button-form-id'];
  if (formId && String(formId).trim()) submitButton.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata ?? config['button-data'];
  if (buttonData && String(buttonData).trim()) submitButton.dataset.buttonData = String(buttonData).trim();
}

function buildFormDef(variantDefaults, config) {
  const formTitle = config['form-title'] || variantDefaults.formTitle;
  const submitLabel = config['submit-label'] || variantDefaults.submitLabel;
  const showAddress = variantDefaults.showAddressSection;

  const personalFields = [
    {
      id: 'personal-info-heading',
      fieldType: 'heading',
      label: { value: 'Your personal informations' },
      appliedCssClassNames: 'col-12 td-section-heading',
    },
    {
      id: 'firstName',
      name: 'firstName',
      fieldType: 'text-input',
      label: { value: 'First Name' },
      autoComplete: 'given-name',
      required: true,
      properties: { colspan: 6 },
    },
    {
      id: 'lastName',
      name: 'lastName',
      fieldType: 'text-input',
      label: { value: 'Last Name' },
      autoComplete: 'family-name',
      required: true,
      properties: { colspan: 6 },
    },
    {
      id: 'email',
      name: 'email',
      fieldType: 'text-input',
      label: { value: 'Email' },
      autoComplete: 'email',
      required: true,
      properties: { colspan: 6 },
    },
    {
      id: 'phone',
      name: 'phone',
      fieldType: 'text-input',
      label: { value: 'Phone number' },
      autoComplete: 'tel',
      required: true,
      properties: { colspan: 6 },
    },
  ];

  const addressFields = showAddress ? [
    {
      id: 'address-heading',
      fieldType: 'heading',
      label: { value: 'Vehicle arrival address' },
      appliedCssClassNames: 'col-12 td-section-heading',
    },
    {
      id: 'address',
      name: 'address',
      fieldType: 'text-input',
      label: { value: 'Address' },
      autoComplete: 'street-address',
      properties: { colspan: 6 },
    },
    {
      id: 'city',
      name: 'city',
      fieldType: 'text-input',
      label: { value: 'City' },
      autoComplete: 'address-level2',
      properties: { colspan: 6 },
    },
    {
      id: 'zipCode',
      name: 'zipCode',
      fieldType: 'text-input',
      label: { value: 'Zip code' },
      autoComplete: 'postal-code',
      properties: { colspan: 6 },
    },
  ] : [];

  return {
    id: 'test-drive',
    fieldType: 'form',
    appliedCssClassNames: 'test-drive-form',
    items: [
      {
        id: 'heading-test-drive',
        fieldType: 'heading',
        label: { value: formTitle },
        appliedCssClassNames: 'col-12 td-form-title',
      },
      {
        id: 'panel-main',
        name: 'main',
        fieldType: 'panel',
        items: [
          ...personalFields,
          ...addressFields,
          {
            id: 'submit-btn',
            name: 'submitButton',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: submitLabel },
            appliedCssClassNames: 'submit-wrapper col-12',
          },
        ],
      },
    ],
  };
}

// ── TimeSlotPicker ────────────────────────────────────────────────────────────

function buildTimeSlotPicker(config = {}, dataLayerKey) {
  const rawSlots = config['time-slots'] || '';
  const dailyOptions = rawSlots
    ? rawSlots.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_TIME_SLOTS;
  const daysShown = parseInt(config['days-shown'], 10) || DEFAULT_DAYS_SHOWN;
  const multiple = isTruthy(config['multiple-slots']);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dateOffset = 0;
  let selection = multiple ? [] : null;
  const slotData = {};

  const wrapper = document.createElement('div');
  wrapper.className = 'td-slot-picker';

  const labelEl = document.createElement('p');
  labelEl.className = 'td-slot-picker__label';
  labelEl.textContent = 'Choose available day and time';

  const content = document.createElement('div');
  content.className = 'td-slot-picker__content';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'td-slot-picker__nav td-slot-picker-nav-prev';
  prevBtn.setAttribute('aria-label', 'Previous days');
  prevBtn.innerHTML = NAV_ARROW_ICON;

  const columnsEl = document.createElement('div');
  columnsEl.className = 'td-slot-picker__columns';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'td-slot-picker__nav';
  nextBtn.setAttribute('aria-label', 'Next days');
  nextBtn.innerHTML = NAV_ARROW_ICON;

  content.append(prevBtn, columnsEl, nextBtn);
  wrapper.append(labelEl, content);

  function isSelected(val) {
    return multiple ? selection.includes(val) : selection === val;
  }

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

  function pushAppointmentDataLayer(val) {
    if (typeof window.updateDataLayer !== 'function') return;
    window.updateDataLayer({
      interactionDetails: {
        automotive: {
          [dataLayerKey]: {
            dateTime: Array.isArray(val) ? val.join('; ') : val || '',
          },
        },
      },
    });
  }

  function selectSlot(val) {
    if (multiple) {
      selection = selection.includes(val)
        ? selection.filter((v) => v !== val)
        : [...selection, val];
    } else {
      selection = val;
    }
    pushAppointmentDataLayer(selection);
    render();
  }

  function render() {
    columnsEl.innerHTML = '';
    for (let i = 0; i < daysShown; i++) {
      const date = addDays(today, dateOffset + i);
      const col = getOrCreateDayData(date);

      const colEl = document.createElement('div');
      colEl.className = 'td-slot-picker__column';

      const header = document.createElement('div');
      header.className = 'td-slot-picker__col-header';
      header.innerHTML = `<strong>${col.dayName}</strong><em>${col.day} ${col.monthName}</em>`;
      colEl.append(header);

      col.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.label;
        btn.className = 'td-slot-picker__option'
          + (opt.disabled ? ' is-disabled' : '')
          + (isSelected(opt.value) ? ' is-selected' : '');
        if (!opt.disabled) btn.addEventListener('click', () => selectSlot(opt.value));
        colEl.append(btn);
      });

      columnsEl.append(colEl);
    }
    prevBtn.disabled = dateOffset <= 0;
  }

  prevBtn.addEventListener('click', () => { dateOffset = Math.max(0, dateOffset - daysShown); render(); });
  nextBtn.addEventListener('click', () => { dateOffset += daysShown; render(); });

  render();

  wrapper.getSelection = () => (Array.isArray(selection) ? selection.join('; ') : selection || '');

  return wrapper;
}

// ── Submit handler ────────────────────────────────────────────────────────────

function showSuccessMessage(form, message) {
  form.querySelectorAll('.form-message').forEach((el) => el.remove());
  const msgEl = document.createElement('div');
  msgEl.className = 'form-message success';
  msgEl.textContent = message;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.parentNode.insertBefore(msgEl, submitBtn);
    submitBtn.disabled = true;
  } else {
    form.appendChild(msgEl);
  }
}

function showToast(message) {
  const existing = document.querySelector('.td-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'td-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('td-toast--visible'));

  setTimeout(() => {
    toast.classList.remove('td-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function attachSubmitHandler(block, config, variantDefaults, slotPicker) {
  const form = block.querySelector('form');
  if (!form) return;

  const successMessage = config['success-message'] || variantDefaults.successMessage;
  const redirectUrl = normalizeAemPath(config['redirect-url'] || config.redirecturl || '');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedSlot = slotPicker.getSelection();
    const existingErr = block.querySelector('.td-slot-error');
    if (!selectedSlot) {
      if (!existingErr) {
        const err = document.createElement('p');
        err.className = 'td-slot-error';
        err.textContent = 'Please select an available day and time.';
        slotPicker.after(err);
      }
      return;
    }
    block.querySelector('.td-slot-error')?.remove();

    syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    if (typeof window.updateDataLayer === 'function') {
      window.updateDataLayer({
        interactionDetails: {
          automotive: {
            [variantDefaults.dataLayerKey]: {
              dateTime: selectedSlot,
            },
          },
        },
      });
    }

    const submitBtn = form.querySelector("button[type='submit']");

    const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
    if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
      const sheetData = await fetchButtonDataSheet(normalizeAemPath(buttonDataUrl));
      if (sheetData) window.updateDataLayer(sheetData);
    }

    const eventType = submitBtn?.dataset?.buttonEventType?.trim();
    if (eventType) dispatchCustomEvent(eventType);

    if (redirectUrl) {
      showSuccessMessage(form, successMessage);
      setTimeout(() => { window.location.href = redirectUrl; }, 2000);
    } else {
      showToast(successMessage);
    }
  });
}

// ── decorate ──────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const variant = normalizeVariant(config.variant);
  const variantDefaults = VARIANTS[variant] || VARIANTS['test-drive'];

  // Build the adaptive form
  const formDef = buildFormDef(variantDefaults, config);
  const formContainer = document.createElement('div');
  formContainer.className = 'form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);

  block.replaceChildren(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  // Inject time slot picker before the submit button
  const slotPicker = buildTimeSlotPicker(config, variantDefaults.dataLayerKey);
  const submitWrapper = block.querySelector('.submit-wrapper');
  if (submitWrapper) {
    submitWrapper.before(slotPicker);
  } else {
    block.append(slotPicker);
  }

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    attachSubmitHandler(block, config, variantDefaults, slotPicker);
    const form = block.querySelector('form');
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);
    }
  }, 100);
}
