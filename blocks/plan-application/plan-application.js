import { readBlockConfig } from "../../scripts/aem.js";
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

function isTruthy(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function shouldAutoSubmitOnLastPanel(config = {}) {
  return isTruthy(config['auto-submit-on-last-panel']);
}

function buildPlanApplicationWizardPayload(currentStepIndex, totalSteps, config = {}) {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return null;
  const wizardName = getConfigValue(config, 'form-name', 'formname') || 'Plan Application';
  const wizardTitle = getConfigValue(config, 'form-title', 'formtitle') || 'Plan Application';
  const safeIndex = Number.isFinite(currentStepIndex) ? Math.min(Math.max(currentStepIndex, 0), totalSteps - 1) : 0;
  const steps = Array.from({ length: totalSteps }, (_, idx) => ({
    name: `plan-application-step-${idx + 1}`,
    title: `${wizardTitle} - Step ${idx + 1}`,
  }));
  return { name: wizardName, title: wizardTitle, steps, currentStep: safeIndex + 1 };
}

function updatePlanApplicationWizardDataLayer(wizard, stepIndex, config = {}) {
  if (!wizard || !window.updateDataLayer) return;
  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const payload = buildPlanApplicationWizardPayload(stepIndex, totalSteps, config);
  if (!payload) return;
  window.updateDataLayer({ wizard: payload });
}

function getPlanApplicationWizardStepIndex(wizard) {
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

function getPlanApplicationJointApplicantValue(form) {
  const selected = form?.querySelector('input[name="jointApplicant"]:checked');
  return selected?.value ? String(selected.value).trim() : '';
}

function updatePlanApplicationEnrollmentDataLayer(form, wizard) {
  if (!window.updateDataLayer || !form || !wizard) return;
  const currentStepIndex = getPlanApplicationWizardStepIndex(wizard);
  const enrollment = {
    currentStep: Math.max(currentStepIndex + 2, 2),
  };
  const jointApplicant = getPlanApplicationJointApplicantValue(form);
  if (jointApplicant) enrollment.jointApplicant = jointApplicant;
  window.updateDataLayer({ enrollment });
}

// ============================================================
//  SUBMIT BUTTON AUTHORING CONFIG
// ============================================================
function applyButtonConfigToSubmitButton(block, config) {
  const submitButton = block.querySelector("form button[type='submit']")
    || block.querySelector('.wizard-button-next button');
  if (!submitButton) return;
  const eventType = config.buttoneventtype;
  if (eventType && String(eventType).trim()) submitButton.dataset.buttonEventType = String(eventType).trim();
  const webhookUrl = config.buttonwebhookurl;
  if (webhookUrl && String(webhookUrl).trim()) submitButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid;
  if (formId && String(formId).trim()) submitButton.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata;
  if (buttonData && String(buttonData).trim()) submitButton.dataset.buttonData = String(buttonData).trim();
  submitButton.textContent = 'Next';
}

// ============================================================
//  PLAN APPLICATION FORM DEFINITION
// ============================================================
function buildPlanApplicationDef(planName) {
  const applicationTitle = `${planName} Application`;

  const step1 = {
    id: 'step-1-personal-details',
    name: 'step1',
    fieldType: 'panel',
    items: [
      { id: 'step-1-title', fieldType: 'heading', label: { value: applicationTitle }, appliedCssClassNames: 'wizard-step-title col-12 mo-1' },
      { id: 'step-1-subtitle', fieldType: 'heading', label: { value: 'Personal Details' }, appliedCssClassNames: 'wizard-step-subtitle col-12 mo-2' },
      
      // Column 1 (Left)
      { id: 'firstName', name: 'firstName', fieldType: 'text-input', label: { value: 'First name' }, placeholder: 'First Name', properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-3' },
      // Column 2 (Right)
      { id: 'birthDate', name: 'dateOfBirth', fieldType: 'text-input', label: { value: 'Date of birth' }, placeholder: 'YYYY-MM-DD', properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-5' },
      
      // Column 1 (Left)
      { id: 'lastName', name: 'lastName', fieldType: 'text-input', label: { value: 'Last name' }, placeholder: 'Last Name', properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-4' },
      // Column 2 (Right)
      { id: 'gender', name: 'gender', fieldType: 'drop-down', label: { value: 'Gender' }, enum: ['female', 'male', 'not_specified', 'non_specific'], enumNames: ['Female', 'Male', 'Not Specified', 'Non-specific'], properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-6' },
      
      // Column 1 (Left)
      { id: 'email', name: 'email', fieldType: 'text-input', label: { value: 'Email' }, properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-7' },
      // Column 2 (Right)
      { id: 'phoneNumber', name: 'phone', fieldType: 'text-input', label: { value: 'Mobile phone number' }, properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-8' },
      
      // Column 1 (Left)
      { id: 'jointApplicant', name: 'jointApplicant', fieldType: 'radio-group', label: { value: 'Is there a joint applicant?' }, enum: ['yes', 'no'], enumNames: ['Yes', 'No'], properties: { alignment: 'vertical', colspan: 6 }, appliedCssClassNames: 'col-6 radio-group-field mo-9' }
    ],
  };

  const step2 = {
    id: 'step-2-address-identity',
    name: 'step2',
    fieldType: 'panel',
    items: [
      { id: 'step-2-title', fieldType: 'heading', label: { value: applicationTitle }, appliedCssClassNames: 'wizard-step-title col-12 mo-1' },
      
      // Subtitles mapped to 2-column grid
      { id: 'address-heading', fieldType: 'heading', label: { value: 'Address' }, appliedCssClassNames: 'wizard-step-subtitle col-6 mo-2' },
      { id: 'identity-heading', fieldType: 'heading', label: { value: 'Identity' }, appliedCssClassNames: 'wizard-step-subtitle col-6 mo-6' },

      // Column 1 (Left - Address)
      { id: 'address', name: 'streetAddress', fieldType: 'text-input', label: { value: 'Street Address' }, placeholder: 'Street and number', properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-3' },
      // Column 2 (Right - Identity)
      { id: 'ssn', name: 'ssn', fieldType: 'text-input', label: { value: 'Social Security Number' }, properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-7' },

      // Column 1 (Left - Address)
      { id: 'zipCode', name: 'zipCode', fieldType: 'text-input', label: { value: 'Zip code' }, properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-4' },
      // Column 2 (Right - Identity)
      { id: 'patientNumber', name: 'patientNumber', fieldType: 'text-input', label: { value: 'Patient number' }, properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-8' },

      // Column 1 (Left - Address)
      { id: 'state', name: 'state', fieldType: 'text-input', label: { value: 'State' }, properties: { colspan: 6 }, appliedCssClassNames: 'col-6 mo-5' },
    ],
  };

  const step3 = {
    id: 'step-3-success',
    name: 'step3',
    fieldType: 'panel',
    items: [
      { id: 'step-3-title', fieldType: 'heading', label: { value: 'Congratulations!' }, appliedCssClassNames: 'wizard-step-title col-12 mo-1' },
      {
        id: 'step-3-subtitle',
        fieldType: 'heading',
        label: { value: `You have just enrolled in the ${planName}. Your application will be available in your account dashboard and sent to you via email together with your onboarding checklist.` },
        appliedCssClassNames: 'wizard-step-subtitle col-12 mo-2',
      },
    ],
  };

  return {
    id: 'plan-application-form',
    fieldType: 'form',
    appliedCssClassNames: 'plan-application-form is-wizard',
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
//  WIZARD STEP INDICATOR
// ============================================================
function setupWizardStepIndicator(block, config = {}, stepEvent = '', startedEvent = '') {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;

  // The application form has 3 panels including final success state.
  const totalVisualSteps = 3; 
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper) return;

  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'wizard-progress-wrapper Progress Progress--alignment-center';
  
  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'wizard-dots Progress__dots';

  for (let i = 0; i < totalVisualSteps; i++) {
    const dot = document.createElement('div');
    dot.className = 'wizard-dot Progress__dot';
    dotsContainer.appendChild(dot);
  }

  const progressLabel = document.createElement('div');
  progressLabel.className = 'Progress__label';

  progressWrapper.appendChild(dotsContainer);
  progressWrapper.appendChild(progressLabel);

  const prevBtn = btnWrapper.querySelector('.wizard-button-prev button');
  const prevBtnWrapper = btnWrapper.querySelector('.wizard-button-prev');
  const nextBtnWrapper = btnWrapper.querySelector('.wizard-button-next');
  const nextBtn = btnWrapper.querySelector('.wizard-button-next button');
  const autoSubmitOnLastPanel = shouldAutoSubmitOnLastPanel(config);

  const updateWizardUI = () => {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? parseInt(current.dataset.index, 10) : 0;
    const totalSteps = wizard.querySelectorAll('.panel-wrapper').length || totalVisualSteps;
    const isFinalStep = idx >= totalSteps - 1;
    const showManualSubmitOnFinalStep = isFinalStep && !autoSubmitOnLastPanel && !planApplicationSubmissionCompleted;
    const shouldShowNext = !isFinalStep || showManualSubmitOnFinalStep;

    // Update active dots and X/3 label
    dotsContainer.querySelectorAll('.wizard-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i <= idx);
    });
    progressLabel.textContent = `${Math.min(idx + 1, totalSteps)}/${totalSteps} step`;

    // Disable Back button on step 1 and hide nav controls when final step is already submitted.
    if (prevBtn) prevBtn.disabled = idx === 0 || (isFinalStep && !showManualSubmitOnFinalStep);
    if (prevBtnWrapper) prevBtnWrapper.style.display = (isFinalStep && !showManualSubmitOnFinalStep) ? 'none' : '';
    if (nextBtnWrapper) {
      nextBtnWrapper.style.display = shouldShowNext ? '' : 'none';
    }
    if (nextBtn) {
      if (isFinalStep) {
        nextBtn.textContent = autoSubmitOnLastPanel ? 'Next' : (String(config.submitbuttontext || '').trim() || 'Submit');
      } else {
        nextBtn.textContent = 'Next';
      }
    }
    const submitWrapper = wizard.querySelector('.submit-wrapper');
    if (submitWrapper) submitWrapper.style.display = isFinalStep ? 'none' : '';
  };

  const form = block.querySelector('form');

  if (nextBtn && form) {
    nextBtn.addEventListener('click', () => {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      updatePlanApplicationEnrollmentDataLayer(form, wizard);
    });
  }

  const handleNavigation = (event) => {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? parseInt(current.dataset.index, 10) : 0;
    const prevIndex = Number.isFinite(event?.detail?.prevStep?.index)
      ? event.detail.prevStep.index
      : idx - 1;
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
    }
    updatePlanApplicationWizardDataLayer(wizard, idx, config);
    updateWizardUI();
    if (stepEvent && Number.isFinite(prevIndex) && idx > prevIndex) {
      dispatchCustomEvent(stepEvent);
    }

  };

  updateWizardUI();
  wizard.addEventListener('wizard:navigate', handleNavigation);

  if (form && typeof window.updateDataLayer === 'function') {
    const initialIndex = getPlanApplicationWizardStepIndex(wizard);
    updatePlanApplicationWizardDataLayer(wizard, initialIndex, config);
    if (startedEvent) dispatchCustomEvent(startedEvent);
  }

  // Prepend progress wrapper to the form block
  block.insertBefore(progressWrapper, block.firstChild);

  // Cleanly position submit wrapper
  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);
}

// ============================================================
//  SUBMIT HANDLER (Triggers Step 3 Success UI)
// ============================================================
function attachSubmitHandler(block, config = {}) {
  const form = block.querySelector('form');
  if (!form) return;

  // Prevent browser-native submits (e.g., Enter key) from bypassing wizard flow.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
  });

  const wizard = form.querySelector('.wizard');
  if (!wizard) return;
  const autoSubmitOnLastPanel = shouldAutoSubmitOnLastPanel(config);
  const nextBtn = wizard.querySelector('.wizard-button-next button');

  const submitOnLastPanel = async (stepIndexForPayload) => {
    const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
    try {
      planApplicationFormSubmitting = true;
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      if (typeof window.updateDataLayer === 'function') {
        window.updateDataLayer({
          wizard: buildPlanApplicationWizardPayload(stepIndexForPayload, totalSteps || 3, config),
        });
      }

      const submitBtn = block.querySelector('.wizard-button-next button')
        || form.querySelector("button[type='submit']");

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

      planApplicationSubmissionCompleted = true;
    } catch (error) {
      console.error("Plan application submit error:", error);
    } finally {
      planApplicationFormSubmitting = false;
    }
  };

  if (nextBtn) {
    nextBtn.addEventListener('click', async (event) => {
      if (autoSubmitOnLastPanel || planApplicationFormSubmitting || planApplicationSubmissionCompleted) return;
      const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
      const finalStepIndex = totalSteps - 1;
      const currentStepIndex = getPlanApplicationWizardStepIndex(wizard);
      if (currentStepIndex !== finalStepIndex) return;
      event.preventDefault();
      await submitOnLastPanel(finalStepIndex);
    });
  }

  wizard.addEventListener('wizard:navigate', async (event) => {
    if (planApplicationFormSubmitting || planApplicationSubmissionCompleted) return;

    const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
    const finalStepIndex = totalSteps - 1;
    const nextStepIndex = Number.isFinite(event?.detail?.nextStep?.index)
      ? event.detail.nextStep.index
      : getPlanApplicationWizardStepIndex(wizard);

    // Submit once when entering final success panel from a previous panel.
    if (nextStepIndex !== finalStepIndex || finalStepIndex < 0) return;

    const prevStepIndex = Number.isFinite(event?.detail?.prevStep?.index)
      ? event.detail.prevStep.index
      : Math.max(finalStepIndex - 1, 0);
    if (prevStepIndex >= finalStepIndex) return;

    // Auto-submit only when last panel opens and authoring enables it.
    if (!autoSubmitOnLastPanel) return;
    await submitOnLastPanel(finalStepIndex);
  });
}

let planApplicationAbandonEventsInitialized = false;
let planApplicationAbandonedEventDispatched = false;
let planApplicationFormSubmitting = false;
let planApplicationSubmissionCompleted = false;
let planApplicationAbandonedEventType = '';

function dispatchPlanApplicationAbandonedEvent() {
  if (planApplicationAbandonedEventDispatched || planApplicationFormSubmitting || planApplicationSubmissionCompleted) return;
  planApplicationAbandonedEventDispatched = true;
  dispatchCustomEvent(planApplicationAbandonedEventType);
}

function handlePlanApplicationBeforeUnload() {
  if (planApplicationFormSubmitting || planApplicationSubmissionCompleted) return;
  dispatchPlanApplicationAbandonedEvent();
}

function handlePlanApplicationVisibilityChange() {
  if (planApplicationFormSubmitting || planApplicationSubmissionCompleted) return;
  if (document.visibilityState === 'hidden') {
    dispatchPlanApplicationAbandonedEvent();
  }
}

function setupPlanApplicationAbandonEvents(abandonedEvent) {
  if (planApplicationAbandonEventsInitialized) return;
  planApplicationAbandonEventsInitialized = true;
  planApplicationAbandonedEventType = abandonedEvent;
  window.addEventListener('beforeunload', handlePlanApplicationBeforeUnload);
  document.addEventListener('visibilitychange', handlePlanApplicationVisibilityChange);
}

// ============================================================
//  DECORATE
// ============================================================
export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  const startedEvent = (config['started-event-type'] || '').toString().trim();
  const stepEvent = (config['step-event-type'] || '').toString().trim();
  const abandonedEvent = (config['abandoned-event-type'] || '').toString().trim();
  
  // Extract plan name from URL params, fallback to authored config
  const urlParams = new URLSearchParams(window.location.search);
  const planName = urlParams.get('planName') || urlParams.get('plan') || config.defaultPlanName || config.defaultplanname || 'Medicare Extra (HMO) Plan';

  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const formDef = buildPlanApplicationDef(planName);
  const formContainer = document.createElement('div');
  formContainer.className = 'form-container';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  
  block.replaceChildren(formContainer);

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
  setupPlanApplicationAbandonEvents(abandonedEvent);
}