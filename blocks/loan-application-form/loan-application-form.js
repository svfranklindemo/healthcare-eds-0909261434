/**
 * Loan Preapproval Form block – 3-step wizard, adaptive form only.
 * Step 1: First name, Last name, Email, Phone + phone consent text.
 * Step 2: Address, State, ZIP, City, Country + authorization checkbox.
 * Step 3: Upload documents (Proof of Income, Utility Bill, Employment Verification) + Submit.
 * No fields are mandatory. Back / step indicator / Next or Submit.
 */

import { readBlockConfig, loadCSS } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync, submitToWebhook, fetchButtonDataSheet } from '../../scripts/form-data-layer.js';
import { normalizeAemPath } from '../../scripts/scripts.js';

let loanApplicationFormWizardTitle;
let loanApplicationFormWizardName;
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

function setupLoanApplicationFormPrefill(form) {
  if (!form) return;
  const syncPrefillToDataLayer = () => {
    const didPrefill = prePopulateFormFromDataLayer(form);
    if (didPrefill) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    }
  };

  syncPrefillToDataLayer();

  if (!window._dataLayerReady) {
    document.addEventListener('dataLayerUpdated', syncPrefillToDataLayer, { once: true });
  }
}

function buildStepMeta(stepIndex) {
  return {
    name: `home-loan-application-step-${stepIndex + 1}`,
    title: `Home Loan Application Step ${stepIndex + 1}`,
  };
}

function buildWizardPayload(currentStepIndex, totalSteps) {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return null;
  const safeIndex = Number.isFinite(currentStepIndex)
    ? Math.min(Math.max(currentStepIndex, 0), totalSteps - 1)
    : 0;
  const steps = Array.from({ length: totalSteps }, (_, idx) => buildStepMeta(idx));
  return {
    name: loanApplicationFormWizardName,
    title: loanApplicationFormWizardTitle,
    steps,
    currentStep: safeIndex + 1,
  };
}

function getTotalWizardSteps(wizard) {
  if (!wizard) return 0;
  return wizard.querySelectorAll('.panel-wrapper').length;
}

function updateLoanApplicationWizardDataLayer(wizard, stepIndex) {
  if (!window.updateDataLayer) return;
  const totalSteps = getTotalWizardSteps(wizard);
  const payload = buildWizardPayload(stepIndex, totalSteps);
  if (!payload) return;
  window.updateDataLayer({
    wizard: payload,
  });
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

function buildLoanApplicationFormDef(config = {}) {
  const formTitle = loanApplicationFormWizardTitle ;
  const phoneConsentText = "By entering your phone number you're authorizing SecurFinancial to use this number to call, text and send you messages by any method. We won't charge you for any messages but your service provider may.";
  const authorizeText = "I authorize SecurFinancial to verify my credit. I've read and agreed to Mortgage's Terms of Use, Privacy Policy and Consent to Receive Electronic Documents.";
  const stateOptions = ['', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
  const stateNames = ['Select...', ...stateOptions.slice(1)];
  return {
    id: 'loan-application-form',
    fieldType: 'form',
    appliedCssClassNames: 'loan-application-form-form loan-application-form-wizard',
    items: [
      {
        id: 'heading-loan-application',
        fieldType: 'heading',
        label: { value: formTitle },
        appliedCssClassNames: 'col-12 loan-application-form-heading',
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
              {
                id: 'phone-consent',
                fieldType: 'plain-text',
                value: phoneConsentText,
                appliedCssClassNames: 'col-12 loan-application-form-consent',
              },
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
              {
                id: 'authorize',
                name: 'authorize',
                fieldType: 'checkbox',
                label: { value: authorizeText },
                enum: ['on'],
                properties: { colspan: 12 },
              },
            ],
          },
          {
            id: 'step-documents',
            name: 'documents',
            fieldType: 'panel',
            label: { value: 'Upload Documents' },
            items: [
              {
                id: 'upload-instruction',
                fieldType: 'plain-text',
                value: 'Upload documents',
                appliedCssClassNames: 'col-12 loan-application-form-upload-label',
              },
              {
                id: 'proofOfIncome',
                name: 'proofOfIncome',
                fieldType: 'file-input',
                label: { value: 'Proof of Income' },
                type: 'file',
                accept: ['image/*', 'application/pdf'],
                properties: { colspan: 12 },
              },
              {
                id: 'utilityBill',
                name: 'utilityBill',
                fieldType: 'file-input',
                label: { value: 'Utility Bill' },
                type: 'file',
                accept: ['image/*', 'application/pdf'],
                properties: { colspan: 12 },
              },
              {
                id: 'employmentVerification',
                name: 'employmentVerification',
                fieldType: 'file-input',
                label: { value: 'Employment Verification' },
                type: 'file',
                accept: ['image/*', 'application/pdf'],
                properties: { colspan: 12 },
              },
              {
                id: 'submit-preapproval-btn',
                name: 'submitPreapproval',
                fieldType: 'button',
                buttonType: 'submit',
                label: { value: 'Submit' },
                appliedCssClassNames: 'loan-application-form-submit-btn',
              },
            ],
          },
        ],
      },
    ],
  };
}

function collectLoanApplicationFormData(form) {
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    if (el.type === 'checkbox') {
      data[name] = el.checked;
    } else if (el.type === 'file') {
      data[name] = el.files?.length ? Array.from(el.files).map((f) => f.name) : [];
    } else {
      data[name] = el.value || '';
    }
  });
  return data;
}



function clearProductObject() {
  if (typeof window.updateDataLayer === 'function') {
    window.updateDataLayer({ product: {} }, false);
  }
}

function attachLoanApplicationFormSubmitHandler(block, redirectUrl) {
  const form = block.querySelector('form');
  if (!form) return;

  const submitSection = form.querySelector('#step-documents')?.closest('fieldset') || form.querySelector('.panel-wrapper:last-of-type');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    loanFormSubmitting = true;
    const data = collectLoanApplicationFormData(form);
    // eslint-disable-next-line no-console
    console.log('Loan preapproval form data:', data);

    clearProductObject();
    const submitButton = form.querySelector('button[type="submit"]');
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

function setupLoanApplicationStepIndicator(block, stepEvent, startedEvent) {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;
  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper || totalSteps === 0) return;

  const stepLabel = document.createElement('span');
  stepLabel.className = 'loan-application-form-step-label';
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

  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);

  const form = block.querySelector('form');
  if (window.dataLayer && typeof window.updateDataLayer === 'function') {
    attachLoanApplicationFormStepEvents(wizard, form, stepEvent, startedEvent);
  }
}

function getLoanApplicationWizardStepIndex(wizard) {
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

function attachLoanApplicationFormStepEvents(wizard, form, stepEvent, startedEvent) {
  if (!wizard) return;
  const handleNavigation = (event) => {
    const index = Number.isFinite(event?.detail?.currStep?.index)
      ? event.detail.currStep.index
      : getLoanApplicationWizardStepIndex(wizard);
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    }
    const prevIndex = Number.isFinite(event?.detail?.prevStep?.index)
      ? event.detail.prevStep.index
      : index - 1;
    if (Number.isFinite(prevIndex) && index > prevIndex) {
      updateLoanApplicationWizardDataLayer(wizard, index);
      dispatchCustomEvent(stepEvent);
    }
  };
  wizard.addEventListener('wizard:navigate', handleNavigation);
  if (form) {
    syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);
  }
  const initialIndex = getLoanApplicationWizardStepIndex(wizard);
  updateLoanApplicationWizardDataLayer(wizard, initialIndex);
  dispatchCustomEvent(startedEvent);
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  loanApplicationFormWizardTitle =
  (config.formtitle ?? config['form-title'] ?? '')
    .toString()
    .trim() || 'Home Loan Application Form';

  loanApplicationFormWizardName =
  (config.formname ?? config['form-name'] ?? '')
    .toString()
    .trim() || 'home-loan-application';
  
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/form/form.css`);

  block.classList.add('loan-application-form-block');

  const formDef = buildLoanApplicationFormDef(config);
  const formContainer = document.createElement('div');
  formContainer.className = 'loan-application-form-wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  const startedEvent = (config['started-event-type'] || '').toString().trim();
  const stepEvent = (config['step-event-type'] || '').toString().trim();
  const abandonedEvent = (config['abandoned-event-type'] || '').toString().trim();

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config, 'home-loan-application-submit');
    attachLoanApplicationFormSubmitHandler(block, config.redirecturl);
    const form = block.querySelector('form');
    if (form) {
      setupLoanApplicationFormPrefill(form);
    }
    setupLoanApplicationStepIndicator(block, stepEvent, startedEvent);
  }, 100);
  setupLoanApplicationAbandonEvents(abandonedEvent);
}

let loanAbandonEventsInitialized = false;
let loanAbandonedEventDispatched = false;
let loanFormSubmitting = false;
let loanAbandonedEventType = '';

function dispatchLoanFormAbandonedEvent() {
  if (loanAbandonedEventDispatched || loanFormSubmitting) return;
  loanAbandonedEventDispatched = true;
  dispatchCustomEvent(loanAbandonedEventType);
}

function handleLoanBeforeUnload() {
  if (loanFormSubmitting) return;
  dispatchLoanFormAbandonedEvent();
}

function handleLoanVisibilityChange() {
  if (loanFormSubmitting) return;
  if (document.visibilityState === 'hidden') {
    dispatchLoanFormAbandonedEvent();
  }
}

function setupLoanApplicationAbandonEvents(abandonedEvent) {
  if (loanAbandonEventsInitialized) return;
  loanAbandonEventsInitialized = true;
  loanAbandonedEventType = abandonedEvent;
  window.addEventListener('beforeunload', handleLoanBeforeUnload);
  document.addEventListener('visibilitychange', handleLoanVisibilityChange);
}
