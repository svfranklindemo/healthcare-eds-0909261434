import { readBlockConfig } from "../../scripts/aem.js";
import { normalizeAemPath } from "../../scripts/scripts.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { submitToWebhook, fetchButtonDataSheet, syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync } from "../../scripts/form-data-layer.js";

function getConfigValue(config, ...keys) {
  for (const key of keys) {
    const value = config?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function buildInsurancePlanWizardPayload(currentStepIndex, totalSteps, config = {}) {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return null;
  const wizardName = getConfigValue(config, 'form-name', 'formname') || 'Insurance Plan Selection';
  const wizardTitle = getConfigValue(config, 'form-title', 'formtitle') || getConfigValue(config, 'formHeading', 'formheading') || 'Insurance Plan Selection';
  const safeIndex = Number.isFinite(currentStepIndex)
    ? Math.min(Math.max(currentStepIndex, 0), totalSteps - 1)
    : 0;
  const steps = Array.from({ length: totalSteps }, (_, idx) => ({
    name: `insurance-plan-selection-step-${idx + 1}`,
    title: `${wizardTitle} - Step ${idx + 1}`,
  }));
  return { name: wizardName, title: wizardTitle, steps, currentStep: safeIndex + 1 };
}

function updateInsurancePlanWizardDataLayer(wizard, stepIndex, config = {}) {
  if (!wizard || !window.updateDataLayer) return;
  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const payload = buildInsurancePlanWizardPayload(stepIndex, totalSteps, config);
  if (!payload) return;
  window.updateDataLayer({ wizard: payload });
}

function getInsurancePlanWizardStepIndex(wizard) {
  const current = wizard?.querySelector('.current-wizard-step');
  if (current && typeof current.dataset.index !== 'undefined') {
    const index = Number.parseInt(current.dataset.index, 10);
    if (!Number.isNaN(index)) return index;
  }
  const first = wizard?.querySelector('.panel-wrapper');
  if (first && typeof first.dataset.index !== 'undefined') {
    const fallbackIndex = Number.parseInt(first.dataset.index, 10);
    if (!Number.isNaN(fallbackIndex)) return fallbackIndex;
  }
  return 0;
}

// ============================================================
//  INSURANCE PLAN WIZARD DEFINITION (3 Steps)
// ============================================================
function buildInsurancePlanDef() {
  const step1 = {
    id: 'step-1-coverage',
    name: 'step1',
    fieldType: 'panel',
    items: [
      { id: 'step-1-title', fieldType: 'heading', label: { value: 'Are you looking for coverage for yourself or your family?' }, appliedCssClassNames: 'wizard-step-title col-12' },
      { id: 'coverageFor', name: 'coverageFor', fieldType: 'radio-group',
        enum: ['myself', 'family'],
        enumNames: ['Myself', 'Family'],
        properties: { alignment: 'vertical', colspan: 12 },
        appliedCssClassNames: 'col-12' 
      }
    ],
  };

  const step2 = {
    id: 'step-2-frequency',
    name: 'step2',
    fieldType: 'panel',
    items: [
      { id: 'step-2-title', fieldType: 'heading', label: { value: 'How often do you get care?' }, appliedCssClassNames: 'wizard-step-title col-12' },
      { id: 'step-2-sub', fieldType: 'heading', label: { value: 'This includes needing coverage for things like ongoing prescriptions, regular lab tests, etc.' }, appliedCssClassNames: 'wizard-step-subtitle col-12' },
      { id: 'careFrequency', name: 'careFrequency', fieldType: 'radio-group',
        enum: ['never', 'rarely', 'sometimes', 'often'],
        enumNames: ['Never', 'Rarely', 'Sometimes', 'Often'],
        properties: { alignment: 'vertical', colspan: 12 },
        appliedCssClassNames: 'col-12' 
      }
    ],
  };

  const step3 = {
    id: 'step-3-preference',
    name: 'step3',
    fieldType: 'panel',
    items: [
      { id: 'step-3-title', fieldType: 'heading', label: { value: 'Would you rather:' }, appliedCssClassNames: 'wizard-step-title col-12' },
      { id: 'costPreference', name: 'costPreference', fieldType: 'radio-group',
        enum: ['lower', 'higher'],
        enumNames: [
          'Pay a lower monthly premium and stay in-network for care', 
          'Pay a higher monthly premium and be able to choose any doctor'
        ],
        properties: { alignment: 'vertical', colspan: 12 },
        appliedCssClassNames: 'col-12' 
      },
      { id: 'submit-btn', name: 'submitButton', fieldType: 'button', buttonType: 'submit', label: { value: 'Submit' }, appliedCssClassNames: 'submit-wrapper col-12' }
    ],
  };

  return {
    id: 'insurance-plan-form',
    fieldType: 'form',
    appliedCssClassNames: 'plan-selection-form is-wizard',
    items: [
      {
        id: 'panel-wizard', name: 'wizard', fieldType: 'panel',
        ':type': 'fd/panel/wizard',
        items: [step1, step2, step3],
      },
    ],
  };
}

// ============================================================
//  SUBMIT BUTTON AUTHORING CONFIG
// ============================================================
function applyButtonConfigToSubmitButton(block, config) {
  const submitButton = block.querySelector("form button[type='submit']");
  if (!submitButton) return;
  const eventType = config.buttoneventtype;
  if (eventType && String(eventType).trim()) submitButton.dataset.buttonEventType = String(eventType).trim();
  const webhookUrl = config.buttonwebhookurl;
  if (webhookUrl && String(webhookUrl).trim()) submitButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid;
  if (formId && String(formId).trim()) submitButton.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata;
  if (buttonData && String(buttonData).trim()) submitButton.dataset.buttonData = String(buttonData).trim();
  submitButton.textContent = config.submitbuttontext?.trim() || 'Submit';
}

// ============================================================
//  WIZARD NAVIGATION & STEP INDICATOR
// ============================================================
function setupWizardStepIndicator(block, config = {}, stepEvent = '', startedEvent = '') {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;

  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper || totalSteps === 0) return;

  // Create progress indicator
  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'wizard-progress-wrapper';
  
  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'wizard-dots';

  for (let i = 0; i < totalSteps; i++) {
    const dot = document.createElement('div');
    dot.className = 'wizard-dot';
    dotsContainer.appendChild(dot);
  }

  progressWrapper.appendChild(dotsContainer);

  // Grab the back button to manage its disabled state
  const prevBtn = btnWrapper.querySelector('.wizard-button-prev button');

  const updateWizardUI = () => {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? parseInt(current.dataset.index, 10) : 0;
    
    // 1. Update Dots
    dotsContainer.querySelectorAll('.wizard-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i <= idx);
    });

    // 2. Disable Back button on the first step
    if (prevBtn) {
      prevBtn.disabled = idx === 0;
    }
  };

  const form = block.querySelector('form');
  const handleNavigation = (event) => {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? parseInt(current.dataset.index, 10) : 0;
    const prevIndex = Number.isFinite(event?.detail?.prevStep?.index)
      ? event.detail.prevStep.index
      : idx - 1;
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    }
    updateInsurancePlanWizardDataLayer(wizard, idx, config);
    updateWizardUI();
    if (stepEvent && Number.isFinite(prevIndex) && idx > prevIndex) {
      dispatchCustomEvent(stepEvent);
    }
  };

  updateWizardUI();
  wizard.addEventListener('wizard:navigate', handleNavigation);

  if (form && typeof window.updateDataLayer === 'function') {
    const initialIndex = getInsurancePlanWizardStepIndex(wizard);
    updateInsurancePlanWizardDataLayer(wizard, initialIndex, config);
    if (startedEvent) dispatchCustomEvent(startedEvent);
  }

  // Append progress dots to the main header, NOT the buttons wrapper
  const headerDiv = block.querySelector('.plan-selection-header');
  if (headerDiv) {
    headerDiv.appendChild(progressWrapper);
  }

  // Position Submit button cleanly inside the bottom wrapper
  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);
}

// ============================================================
//  SUBMIT HANDLER
// ============================================================
function attachSubmitHandler(block, config) {
  const form = block.querySelector('form');
  if (!form) return;

  const redirectUrl = config.redirecturl || config.redirectUrl;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = {};
    
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      const name = el.getAttribute('name');
      if (name) {
        if (el.type === 'radio' && el.checked) formData[name] = el.value;
        else if (el.type === 'checkbox') formData[name] = el.checked;
        else if (el.type !== 'radio' && el.type !== 'checkbox') formData[name] = el.value;
      }
    });

    try {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      const wizard = form.querySelector('.wizard');
      const current = wizard?.querySelector('.current-wizard-step');
      const currentStepIndex = current ? Number.parseInt(current.dataset.index, 10) : 0;
      if (typeof window.updateDataLayer === 'function') {
        const planSelection = {};
        const coverageFor = (formData.coverageFor || '').trim();
        const careFrequency = (formData.careFrequency || '').trim();
        const coveragePreference = (formData.costPreference || '').trim();

        if (coverageFor) planSelection.coverageFor = coverageFor;
        if (careFrequency) planSelection.careFrequency = careFrequency;
        if (coveragePreference) planSelection.coveragePreference = coveragePreference;

        const dataLayerPayload = {
          wizard: buildInsurancePlanWizardPayload(currentStepIndex, wizard ? wizard.querySelectorAll('.panel-wrapper').length : 3, config),
        };

        if (Object.keys(planSelection).length > 0) {
          dataLayerPayload.planSelection = planSelection;
        }

        window.updateDataLayer(dataLayerPayload);
      }

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
      }

      const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
      if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
        const sheetData = await fetchButtonDataSheet(buttonDataUrl);
        if (sheetData) window.updateDataLayer(sheetData);
      }

      const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim();
      if (authoredEventType) dispatchCustomEvent(authoredEventType);

      const webhookUrl = submitBtn?.dataset?.buttonWebhookUrl?.trim();
      const formId = submitBtn?.dataset?.buttonFormId?.trim();
      if (webhookUrl) await submitToWebhook(form, webhookUrl, formId);

      const redirectTo = normalizeAemPath(redirectUrl);
      if (redirectTo) {
        window.location.href = redirectTo;
      } else {
        alert("Success! Form submitted.");
        if (submitBtn) {
          submitBtn.textContent = config.submitbuttontext?.trim() || 'Submit';
          submitBtn.disabled = false;
        }
      }
    } catch (error) {
      console.error("Plan selection submit error:", error);
    }
  });
}

// ============================================================
//  DECORATE
// ============================================================
const insurancePlanAbandonEvents = {
  initialized: false,
  dispatched: false,
  submitting: false,
  type: '',
};

function dispatchInsurancePlanAbandonedEvent() {
  if (insurancePlanAbandonEvents.dispatched || insurancePlanAbandonEvents.submitting) return;
  insurancePlanAbandonEvents.dispatched = true;
  dispatchCustomEvent(insurancePlanAbandonEvents.type);
}

function handleInsurancePlanBeforeUnload() {
  if (insurancePlanAbandonEvents.submitting) return;
  dispatchInsurancePlanAbandonedEvent();
}

function handleInsurancePlanVisibilityChange() {
  if (insurancePlanAbandonEvents.submitting) return;
  if (document.visibilityState === 'hidden') {
    dispatchInsurancePlanAbandonedEvent();
  }
}

function setupInsurancePlanAbandonEvents(abandonedEvent) {
  if (insurancePlanAbandonEvents.initialized) return;
  insurancePlanAbandonEvents.initialized = true;
  insurancePlanAbandonEvents.type = abandonedEvent;
  window.addEventListener('beforeunload', handleInsurancePlanBeforeUnload);
  document.addEventListener('visibilitychange', handleInsurancePlanVisibilityChange);
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};

  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const headingText = getConfigValue(config, 'formHeading', 'formheading') || "Which type of health insurance should I get?";
  const subtitleText = config.formSubtitle || config.formsubtitle || "Take our free, short quiz to learn which type of health insurance might be best for you!";
  const startedEvent = (config['started-event-type'] || '').toString().trim();
  const stepEvent = (config['step-event-type'] || '').toString().trim();
  const abandonedEvent = (config['abandoned-event-type'] || '').toString().trim();
  
  const headerDiv = document.createElement('div');
  headerDiv.className = 'plan-selection-header';
  headerDiv.innerHTML = `
    <h1>${headingText}</h1>
    <p>${subtitleText}</p>
  `;

  const formDef = buildInsurancePlanDef();
  
  const formContainer = document.createElement('div');
  formContainer.className = 'form-container';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  
  // Entirely replace the authored rows with our custom header and the form
  block.replaceChildren(headerDiv, formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    setupWizardStepIndicator(block, config, stepEvent, startedEvent);
    const form = block.querySelector('form');
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);
    }
    attachSubmitHandler(block, config);
  }, 100);
  setupInsurancePlanAbandonEvents(abandonedEvent);
}
