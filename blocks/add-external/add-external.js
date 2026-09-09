/**
 * Add External block – two variants via adaptive form.
 * Variant "account": Add external account – Type (Bank Account), Origin, Account number, Authorization / Authorized user name, Submit.
 * Variant "credit-card": Add external credit card – Type (Credit Card), Origin, Card number, Authorization / Authorized user name, Submit.
 */

import { readBlockConfig, loadCSS } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { fetchButtonDataSheet } from '../../scripts/form-data-layer.js';

function buildExternalAccountFormDef() {
  return {
    id: 'add-external-account',
    fieldType: 'form',
    appliedCssClassNames: 'add-external-form',
    items: [
      {
        id: 'heading-add-external',
        fieldType: 'heading',
        label: { value: 'Add external account' },
        appliedCssClassNames: 'col-12 add-external-heading',
      },
      {
        id: 'panel-add-external-account',
        name: 'externalAccount',
        fieldType: 'panel',
        label: { value: '' },
        items: [
          {
            id: 'type',
            name: 'type',
            fieldType: 'drop-down',
            label: { value: 'Type' },
            enum: ['bank-account'],
            enumNames: ['Bank Account'],
            properties: { colspan: 12 },
          },
          { id: 'origin', name: 'origin', fieldType: 'text-input', label: { value: 'Origin' }, properties: { colspan: 12 } },
          { id: 'accountNumber', name: 'accountNumber', fieldType: 'text-input', label: { value: 'Account number' }, properties: { colspan: 12 } },
          {
            id: 'auth-section',
            fieldType: 'plain-text',
            value: 'Authorization',
            appliedCssClassNames: 'col-12 add-external-section-label',
          },
          { id: 'authorizedUserName', name: 'authorizedUserName', fieldType: 'text-input', label: { value: 'Authorized user name' }, properties: { colspan: 12 } },
          {
            id: 'submit-add-external-btn',
            name: 'submitAddExternal',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'Submit' },
            appliedCssClassNames: 'add-external-submit-btn col-12',
          },
        ],
      },
    ],
  };
}

function buildExternalCreditCardFormDef() {
  return {
    id: 'add-external-credit-card',
    fieldType: 'form',
    appliedCssClassNames: 'add-external-form',
    items: [
      {
        id: 'heading-add-external',
        fieldType: 'heading',
        label: { value: 'Add external credit card' },
        appliedCssClassNames: 'col-12 add-external-heading',
      },
      {
        id: 'panel-add-external-credit-card',
        name: 'externalCreditCard',
        fieldType: 'panel',
        label: { value: '' },
        items: [
          {
            id: 'type',
            name: 'type',
            fieldType: 'drop-down',
            label: { value: 'Type' },
            enum: ['', 'credit-card'],
            enumNames: ['Select...', 'Credit Card'],
            properties: { colspan: 12 },
          },
          { id: 'origin', name: 'origin', fieldType: 'text-input', label: { value: 'Origin' }, properties: { colspan: 12 } },
          { id: 'cardNumber', name: 'cardNumber', fieldType: 'text-input', label: { value: 'Card number' }, properties: { colspan: 12 } },
          {
            id: 'auth-section',
            fieldType: 'plain-text',
            value: 'Authorization',
            appliedCssClassNames: 'col-12 add-external-section-label',
          },
          { id: 'authorizedUserName', name: 'authorizedUserName', fieldType: 'text-input', label: { value: 'Authorized user name' }, properties: { colspan: 12 } },
          {
            id: 'submit-add-external-btn',
            name: 'submitAddExternal',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'Submit' },
            appliedCssClassNames: 'add-external-submit-btn col-12',
          },
        ],
      },
    ],
  };
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

function buildFormDef(variant) {
  return variant === 'credit-card' ? buildExternalCreditCardFormDef() : buildExternalAccountFormDef();
}

function collectFormData(form) {
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    data[name] = el.type === 'checkbox' ? el.checked : (el.value || '');
  });
  return data;
}

export default async function decorate(block) {
  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/form/form.css`);

  block.classList.add('add-external-block');

  const cfg = readBlockConfig(block);
  const v = String(cfg.variant ?? 'account').trim().toLowerCase();
  const variant = (v === 'credit-card' || v === 'creditcard') ? 'credit-card' : 'account';

  block.textContent = '';

  const formDef = buildFormDef(variant);
  const formContainer = document.createElement('div');
  formContainer.className = 'add-external-form-wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    const form = block.querySelector('form');
    if (form) {
      applyButtonConfigToSubmitButton(block, cfg);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = collectFormData(form);
        // eslint-disable-next-line no-console
        console.log('Add external form data:', data);

        const submitBtn = form.querySelector("button[type='submit']");
        const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
        if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
          const sheetData = await fetchButtonDataSheet(buttonDataUrl);
          if (sheetData) window.updateDataLayer(sheetData);
        }
        const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim();
        if (authoredEventType) dispatchCustomEvent(authoredEventType);

        const msg = block.querySelector('.add-external-success-msg');
        if (msg) msg.remove();
        const success = document.createElement('p');
        success.className = 'add-external-success-msg';
        success.textContent = 'Thank you. Your information has been submitted.';
        success.setAttribute('role', 'status');
        const panel = form.querySelector('.panel-wrapper');
        if (panel) panel.insertBefore(success, panel.firstChild);
        else form.insertBefore(success, form.firstChild);
      });
    }
  }, 100);
}
