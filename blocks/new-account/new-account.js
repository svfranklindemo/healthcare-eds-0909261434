/**
 * New Account block – 3-step wizard.
 * Step 1: First name, Last name (side-by-side), Email address, Phone number.
 * Step 2: Address, State, ZIP code + City, Country.
 * Step 3: Date of birth, Social Security Number, Submit.
 * Back visible on all steps (including step 1); dots + "n/3 step"; Submit only on last step.
 */

import { readBlockConfig, loadCSS } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync, submitToWebhook, fetchButtonDataSheet } from '../../scripts/form-data-layer.js';
import { normalizeAemPath } from '../../scripts/scripts.js';

function getNestedProperty(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function hasExistingFieldValue(field) {
  if (!field) return false;
  return String(field.value || '').trim() !== '';
}

function setFieldValue(field, value) {
  if (!field || value === undefined || value === null) return false;
  if (field.tagName.toLowerCase() === 'select') {
    const normalized = String(value).trim();
    const optionExists = Array.from(field.options || []).some((option) => option.value === normalized);
    if (!optionExists) return false;
    field.value = normalized;
    return true;
  }
  field.value = String(value).trim();
  return true;
}

function prePopulateFormFromDataLayer(form) {
  if (!form || !window.dataLayer) return false;
  let hasPrefill = false;
  Object.entries(DEFAULT_FORM_FIELD_MAP).forEach(([fieldName, dataLayerPath]) => {
    const field = form.querySelector(`[name="${fieldName}"]`);
    if (!field || hasExistingFieldValue(field)) return;
    const value = getNestedProperty(window.dataLayer, dataLayerPath);
    if (value === undefined || value === null || String(value).trim() === '') return;
    const isSet = setFieldValue(field, value);
    if (!isSet) return;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    hasPrefill = true;
  });
  return hasPrefill;
}

function setupNewAccountFormPrefill(form) {
  if (!form) return;
  const applyPrefill = () => {
    prePopulateFormFromDataLayer(form);
  };

  applyPrefill();

  if (!window._dataLayerReady) {
    document.addEventListener('dataLayerUpdated', applyPrefill, { once: true });
  }
}

function applyButtonConfigToSubmitButton(block, config) {
  const submitButton = block.querySelector("form button[type='submit']");
  if (!submitButton) return;
  const eventType = config.buttoneventtype;
  const normalizedEvent = eventType && String(eventType).trim();
  if (normalizedEvent) submitButton.dataset.buttonEventType = normalizedEvent;
  const webhookUrl = config.buttonwebhookurl;
  if (webhookUrl && String(webhookUrl).trim()) submitButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid;
  if (formId && String(formId).trim()) submitButton.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata;
  if (buttonData && String(buttonData).trim()) submitButton.dataset.buttonData = String(buttonData).trim();
}

function buildNewAccountFormDef() {
  const stateOptions = ['', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
  const stateNames = ['Select...', ...stateOptions.slice(1)];
  return {
    id: 'new-account',
    fieldType: 'form',
    appliedCssClassNames: 'new-account-form new-account-wizard',
    items: [
      {
        id: 'heading-new-account',
        fieldType: 'heading',
        label: { value: newAccountWizardTitle },
        appliedCssClassNames: 'col-12 new-account-heading',
      },
      {
        id: 'panel-wizard',
        name: 'wizard',
        fieldType: 'panel',
        ':type': 'fd/panel/wizard',
        items: [
          {
            id: 'step-personal',
            name: 'personal',
            fieldType: 'panel',
            label: { value: 'Personal Information' },
            items: [
              { id: 'firstName', name: 'firstName', fieldType: 'text-input', label: { value: 'First name' }, properties: { colspan: 6 } },
              { id: 'lastName', name: 'lastName', fieldType: 'text-input', label: { value: 'Last name' }, properties: { colspan: 6 } },
              { id: 'email', name: 'email', fieldType: 'text-input', label: { value: 'Email address' }, properties: { colspan: 12 } },
              { id: 'phone', name: 'phone', fieldType: 'text-input', label: { value: 'Phone number' }, properties: { colspan: 12 } },
            ],
          },
          {
            id: 'step-address',
            name: 'address',
            fieldType: 'panel',
            label: { value: 'Address' },
            items: [
              { id: 'streetAddress', name: 'streetAddress', fieldType: 'text-input', label: { value: 'Address' }, properties: { colspan: 12 } },
              {
                id: 'state',
                name: 'state',
                fieldType: 'drop-down',
                label: { value: 'State' },
                enum: stateOptions,
                enumNames: stateNames,
                properties: { colspan: 12 },
              },
              { id: 'zipCode', name: 'zipCode', fieldType: 'text-input', label: { value: 'ZIP code' }, properties: { colspan: 6 } },
              { id: 'city', name: 'city', fieldType: 'text-input', label: { value: 'City' }, properties: { colspan: 6 } },
              {
                id: 'country',
                name: 'country',
                fieldType: 'drop-down',
                label: { value: 'Country' },
                enum: ['', 'US', 'CA', 'MX', 'GB', 'OTHER'],
                enumNames: ['Select...', 'United States of America', 'Canada', 'Mexico', 'United Kingdom', 'Other'],
                properties: { colspan: 12 },
              },
            ],
          },
          {
            id: 'step-details',
            name: 'details',
            fieldType: 'panel',
            label: { value: 'Details' },
            items: [
              { id: 'dateOfBirth', name: 'dateOfBirth', fieldType: 'text-input', label: { value: 'Date of birth' }, placeholder: 'MM/DD/YYYY', properties: { colspan: 12 } },
              { id: 'ssn', name: 'ssn', fieldType: 'text-input', label: { value: 'Social Security Number' }, properties: { colspan: 12 } },
              {
                id: 'submit-new-account-btn',
                name: 'submitNewAccount',
                fieldType: 'button',
                buttonType: 'submit',
                label: { value: 'Submit' },
                appliedCssClassNames: 'new-account-submit-btn col-12',
              },
            ],
          },
        ],
      },
    ],
  };
}

function collectFormData(form) {
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    if (el.type === 'checkbox') {
      data[name] = el.checked;
    } else {
      data[name] = el.value || '';
    }
  });
  return data;
}

function restrictNumericFields(form) {
  ['ssn'].forEach((name) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return;
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '');
      if (el.value !== digits) el.value = digits;
    });
  });
}

function formatDateOfBirthInput(form) {
  const el = form.querySelector('[name="dateOfBirth"]');
  if (!el) return;
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    if (digits.length > 0) formatted = digits.slice(0, 2);
    if (digits.length > 2) formatted += `/${digits.slice(2, 4)}`;
    if (digits.length > 4) formatted += `/${digits.slice(4, 8)}`;
    if (el.value !== formatted) el.value = formatted;
  });
}



function clearProductObject() {
  if (typeof window.updateDataLayer === 'function') {
    window.updateDataLayer({ product: {} }, false);
  }
}

function attachSubmitHandler(block, redirectUrl) {
  const form = block.querySelector('form');
  if (!form) return;
  const submitSection = form.querySelector('#step-details')?.closest('fieldset') || form.querySelector('.panel-wrapper:last-of-type');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collectFormData(form);
    // eslint-disable-next-line no-console
    console.log('New account form data:', data);
    clearProductObject();
    const submitBtn = form.querySelector("button[type='submit']");
    const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
    if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
      const sheetData = await fetchButtonDataSheet(buttonDataUrl);
      if (sheetData) window.updateDataLayer(sheetData);
    }
    const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim() || 'new-account-form-submit';
    dispatchCustomEvent(authoredEventType);

    const webhookUrl = submitBtn?.dataset?.buttonWebhookUrl?.trim();
    const formId = submitBtn?.dataset?.buttonFormId?.trim();
    if (webhookUrl) await submitToWebhook(form, webhookUrl, formId);

    const url = normalizeAemPath(redirectUrl);
    if (url) setTimeout(() => { window.location.href = url; }, 2000);
  });
}

function setupStepIndicator(block) {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;
  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper || totalSteps === 0) return;

  const stepLabel = document.createElement('span');
  stepLabel.className = 'new-account-step-label';
  stepLabel.setAttribute('aria-live', 'polite');
  function updateStepLabel() {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? (parseInt(current.dataset.index, 10) + 1) : 1;
    stepLabel.textContent = `${idx}/${totalSteps} step`;
  }
  updateStepLabel();
  wizard.addEventListener('wizard:navigate', updateStepLabel);

  const nextBtn = btnWrapper.querySelector('.wizard-button-next, [id*="wizard-button-next"]');
  if (nextBtn) btnWrapper.insertBefore(stepLabel, nextBtn);
  else btnWrapper.appendChild(stepLabel);

  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);

  const form = block.querySelector('form');
  if(window.dataLayer && typeof window.updateDataLayer === 'function') {
    attachNewAccountWizardDataLayerTracking(wizard, form);
  }
}

let newAccountWizardTitle;
let newAccountWizardName;

function buildStepMeta(stepIndex) {
  return {
    name: `new-account-step-${stepIndex + 1}`,
    title: `New Account Step ${stepIndex + 1}`,
  };
}

function buildWizardPayload(currentStepIndex) {
  if (currentStepIndex < 0) return null;
  const steps = {};
  for (let i = 0; i <= currentStepIndex; i += 1) {
    steps[i] = buildStepMeta(i);
  }
  return {
    name: newAccountWizardName,
    title: newAccountWizardTitle,
    steps,
  };
}

function getActiveWizardStepIndex(wizard) {
  const current = wizard.querySelector('.current-wizard-step');
  if (current && typeof current.dataset.index !== 'undefined') {
    const index = Number.parseInt(current.dataset.index, 10);
    if (!Number.isNaN(index)) return index;
  }
  const first = wizard.querySelector('.panel-wrapper');
  if (first && typeof first.dataset.index !== 'undefined') {
    const fallbackIndex = Number.parseInt(first.dataset.index, 10);
    if (!Number.isNaN(fallbackIndex)) return fallbackIndex;
  }
  return 0;
}

/**
 * Keep the wizard metadata in sync with the dataLayer.
 */
function updateNewAccountWizardDataLayer(stepIndex) {
  if (!window.updateDataLayer) return;
  const safeIndex = Number.isFinite(stepIndex) ? stepIndex : 0;
  const payload = buildWizardPayload(safeIndex);
  if (!payload) return;
  window.updateDataLayer({
    wizard: {
      ...payload,
      currentStep: safeIndex + 1,
    },
  });
}

function attachNewAccountWizardDataLayerTracking(wizard, form) {
  if (!wizard) return;
  const handleNavigation = (event) => {
    const index = event?.detail?.currStep?.index;
    const safeIndex = Number.isFinite(index) ? index : getActiveWizardStepIndex(wizard);
    updateNewAccountWizardDataLayer(safeIndex);
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    }
    const prevIndex = Number.isFinite(event?.detail?.prevStep?.index)
      ? event.detail.prevStep.index
      : safeIndex - 1;
    if (Number.isFinite(prevIndex) && safeIndex > prevIndex) {
      dispatchCustomEvent('form-step');
    }
  };
  wizard.addEventListener('wizard:navigate', handleNavigation);
  updateNewAccountWizardDataLayer(getActiveWizardStepIndex(wizard));
  if (form) {
    syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);
  }
  dispatchCustomEvent('form-start');
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};

  newAccountWizardName =
    (config.formname ?? config['form-name'] ?? '')
      .toString()
      .trim() || 'new-account-application';

  newAccountWizardTitle =
    (config.formtitle ?? config['form-title'] ?? '')
      .toString()
      .trim() || 'New Account Application';

  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/form/form.css`);

  block.classList.add('new-account-block');

  const formDef = buildNewAccountFormDef();
  const formContainer = document.createElement('div');
  formContainer.className = 'new-account-wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config, 'new-account-form-submit');
    attachSubmitHandler(block, config.redirecturl);
    const form = block.querySelector('form');
    if (form) {
      setupNewAccountFormPrefill(form);
      restrictNumericFields(form);
      formatDateOfBirthInput(form);
    }
    setupStepIndicator(block);
  }, 100);
}
