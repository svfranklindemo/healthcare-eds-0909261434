/**
 * Credit Card Application Form block – 3-step wizard.
 * Step 1: First name, Last name (side-by-side), Email address, Phone number.
 * Step 2: Address, State (dropdown), ZIP code + City (side-by-side), Country (dropdown).
 * Step 3: Date of birth, Social Security Number, Submit.
 * Back (grey) / step indicator (dots + "n/3 step") / Next or Submit (teal).
 */

import { readBlockConfig, loadCSS } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync, submitToWebhook, fetchButtonDataSheet } from '../../scripts/form-data-layer.js';
import { normalizeAemPath } from '../../scripts/scripts.js';

let creditCardApplicationFormWizardName;
let creditCardApplicationFormWizardTitle;

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

function setupCreditCardApplicationFormPrefill(form) {
  if (!form) return;
  const applyPrefill = () => {
    prePopulateFormFromDataLayer(form);
  };

  applyPrefill();

  if (!window._dataLayerReady) {
    document.addEventListener('dataLayerUpdated', applyPrefill, { once: true });
  }
}

function buildStepMeta(stepIndex) {
  return {
    name: `credit-card-application-step-${stepIndex + 1}`,
    title: `Credit Card Application Step ${stepIndex + 1}`,
  };
}

function buildWizardPayload(currentStepIndex, totalSteps) {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return null;
  const safeIndex = Number.isFinite(currentStepIndex)
    ? Math.min(Math.max(currentStepIndex, 0), totalSteps - 1)
    : 0;
  const steps = Array.from({ length: totalSteps }, (_, idx) => buildStepMeta(idx));
  return {
    name: creditCardApplicationFormWizardName,
    title: creditCardApplicationFormWizardTitle,
    steps,
    currentStep: safeIndex + 1,
  };
}

function getTotalWizardSteps(wizard) {
  if (!wizard) return 0;
  return wizard.querySelectorAll('.panel-wrapper').length;
}

function updateCreditCardApplicationFormWizardDataLayer(wizard, stepIndex) {
  if (!window.updateDataLayer) return;
  const totalSteps = getTotalWizardSteps(wizard);
  const payload = buildWizardPayload(stepIndex, totalSteps);
  if (!payload) return;
  window.updateDataLayer({
    wizard: payload,
  });
}



const CREDIT_CARD_APPLICATION_FORM_TEAL = '#0d9488';
const CREDIT_CARD_APPLICATION_FORM_GREY = '#e5e7eb';

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

function buildCreditCardApplicationFormDef(config = {}) {
  const formTitle = creditCardApplicationFormWizardTitle;
  const stateOptions = ['', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
  const stateNames = ['Select...', ...stateOptions.slice(1)];
  return {
    id: 'credit-card-application-form',
    fieldType: 'form',
    appliedCssClassNames: 'credit-card-application-form-form credit-card-application-form-wizard',
    items: [
      {
        id: 'heading-credit-card-application-form',
        fieldType: 'heading',
        label: { value: formTitle },
        appliedCssClassNames: 'col-12 credit-card-application-form-heading',
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
                id: 'submit-application-btn',
                name: 'submitApplication',
                fieldType: 'button',
                buttonType: 'submit',
                label: { value: 'Submit' },
                appliedCssClassNames: 'credit-card-application-form-submit-btn',
              },
            ],
          },
        ],
      },
    ],
  };
}

function collectCreditCardApplicationFormData(form) {
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
  const numericNames = ['ssn'];
  numericNames.forEach((name) => {
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

function attachCreditCardApplicationFormSubmitHandler(block, redirectUrl) {
  const form = block.querySelector('form');
  if (!form) return;

  const submitSection = form.querySelector('#step-details')?.closest('fieldset') || form.querySelector('.panel-wrapper:last-of-type');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formSubmitting = true;
    const data = collectCreditCardApplicationFormData(form);
    // eslint-disable-next-line no-console
    console.log('Application form data:', data);

    const submitButton = form.querySelector("button[type='submit']");
    const buttonDataUrl = submitButton?.dataset?.buttonData?.trim();
    if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
      const sheetData = await fetchButtonDataSheet(buttonDataUrl);
      if (sheetData) window.updateDataLayer(sheetData);
    }
    const authoredEventType = submitButton?.dataset?.buttonEventType?.trim();
    dispatchCustomEvent(authoredEventType);

    const webhookUrl = submitButton?.dataset?.buttonWebhookUrl?.trim();
    const formId = submitButton?.dataset?.buttonFormId?.trim();
    if (webhookUrl) await submitToWebhook(form, webhookUrl, formId);

    const url = normalizeAemPath(redirectUrl);
    if (url) setTimeout(() => { window.location.href = url; }, 2000);
  });
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};

  creditCardApplicationFormWizardTitle =
  (config.formtitle ?? config['form-title'] ?? '')
    .toString()
    .trim() || 'Credit Card Application';

  creditCardApplicationFormWizardName =
    (config.formname ?? config['form-name'] ?? '')
      .toString()
      .trim() || 'credit-card-application';
    [...block.children].forEach((row) => { row.style.display = 'none'; });

  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/form/form.css`);

  block.classList.add('credit-card-application-form-block');

  const startedEvent = (config['started-event-type'] || '').toString().trim();
  const stepEvent = (config['step-event-type'] || '').toString().trim();
  const abandonedEvent = (config['abandoned-event-type'] || '').toString().trim();

  const formDef = buildCreditCardApplicationFormDef(config);
  const formContainer = document.createElement('div');
  formContainer.className = 'credit-card-application-form-wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config, 'form-submit');
    attachCreditCardApplicationFormSubmitHandler(block, config.redirecturl);
    const form = block.querySelector('form');
    if (form) {
      setupCreditCardApplicationFormPrefill(form);
      restrictNumericFields(form);
      formatDateOfBirthInput(form);
    }
    setupCreditCardApplicationFormStepIndicator(block, stepEvent, startedEvent);
  }, 100);
  setupCreditCardApplicationFormAbandonEvents(abandonedEvent);
}

function setupCreditCardApplicationFormStepIndicator(block, stepEvent, startedEvent) {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;
  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const menu = wizard.querySelector('.wizard-menu-items');
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper || totalSteps === 0) return;

  const stepLabel = document.createElement('span');
  stepLabel.className = 'credit-card-application-form-step-label';
  stepLabel.setAttribute('aria-live', 'polite');
  function updateStepLabel() {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? parseInt(current.dataset.index, 10) : 1;
    stepLabel.textContent = `${idx}/${totalSteps} step`;
  }
  updateStepLabel();
  wizard.addEventListener('wizard:navigate', updateStepLabel);

  const nextBtn = btnWrapper.querySelector('.wizard-button-next, [id*="wizard-button-next"]');
  if (nextBtn) btnWrapper.insertBefore(stepLabel, nextBtn);
  else btnWrapper.appendChild(stepLabel);

  /* Move Submit into the wizard button row so it sits inline with Back and "n/3 step" */
  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);
  const form = block.querySelector('form');
  if (window.dataLayer && typeof window.updateDataLayer === 'function') {
    attachCreditCardApplicationFormStepEvents(wizard, form, stepEvent, startedEvent);
  }
}

function getCreditCardApplicationFormWizardStepIndex(wizard) {
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

function attachCreditCardApplicationFormStepEvents(wizard, form, stepEvent, startedEvent) {
  if (!wizard) return;
  const handleNavigation = (event) => {
    const index = Number.isFinite(event?.detail?.currStep?.index)
      ? event.detail.currStep.index
      : getCreditCardApplicationFormWizardStepIndex(wizard);
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    }
    const prevIndex = Number.isFinite(event?.detail?.prevStep?.index)
      ? event.detail.prevStep.index
      : index - 1;
    if (Number.isFinite(prevIndex) && index > prevIndex) {
      updateCreditCardApplicationFormWizardDataLayer(wizard, index);
      dispatchCustomEvent(stepEvent);
    }
  };
  wizard.addEventListener('wizard:navigate', handleNavigation);
  if (form) {
    syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);
  }
  const initialIndex = getCreditCardApplicationFormWizardStepIndex(wizard);
  updateCreditCardApplicationFormWizardDataLayer(wizard, initialIndex);
  dispatchCustomEvent(startedEvent);
}

let abandonEventsInitialized = false;
let abandonedEventDispatched = false;
let formSubmitting = false;
let abandonedEventType = '';

function dispatchFormAbandonedEvent() {
  if (abandonedEventDispatched || formSubmitting) return;
  abandonedEventDispatched = true;
  dispatchCustomEvent(abandonedEventType);
}

function handleBeforeUnload() {
  if (formSubmitting) return;
  dispatchFormAbandonedEvent();
}

function handleVisibilityChange() {
  if (formSubmitting) return;
  if (document.visibilityState === 'hidden') {
    dispatchFormAbandonedEvent();
  }
}

function setupCreditCardApplicationFormAbandonEvents(event) {
  if (abandonEventsInitialized) return;
  abandonEventsInitialized = true;
  abandonedEventType = event;
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}
