import { readBlockConfig } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { buildFormDataLayerUpdates, DEFAULT_FORM_FIELD_MAP, fetchButtonDataSheet } from '../../scripts/form-data-layer.js';
import { normalizeAemPath } from '../../scripts/scripts.js';

function isTruthy(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
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

function formatMoney(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '$0.00';
  return `$${v.toFixed(2)}`;
}

function radioGroupName(id, name) {
  return `${id}_${name}`;
}

function getRadioValue(form, id, name) {
  const n = radioGroupName(id, name);
  const el = form.querySelector(`input[type="radio"][name="${n}"]:checked`);
  return el?.value ?? '';
}

function collectCheckoutShippingData(form) {
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    const { name: n } = el;
    if (!n || el.type === 'radio') return;
    if (el.type === 'checkbox') {
      data[n] = el.checked;
    } else {
      data[n] = el.value ?? '';
    }
  });
  data.paymentMethod = getRadioValue(form, 'paymentMethod', 'paymentMethod');
  data.shippingMethod = getRadioValue(form, 'shippingMethod', 'shippingMethod');
  return data;
}

function mapPaymentType(paymentMethod) {
  return String(paymentMethod || '').toLowerCase() === 'paypal' ? 'paypal' : 'cards';
}

function mapShippingSelection(shippingMethod) {
  const normalized = String(shippingMethod || '').toLowerCase();
  switch (normalized) {
    case 'ground':
      return { shippingMethod: 'groundShipping', shippingAmount: 10 };
    case 'priority':
      return { shippingMethod: 'priorityShipping', shippingAmount: 20 };
    case 'express':
      return { shippingMethod: 'expressShipping', shippingAmount: 30 };
    case 'pickup':
      return { shippingMethod: 'pickupShipping', shippingAmount: 0 };
    case 'standard':
    default:
      return { shippingMethod: 'standardShipping', shippingAmount: 0 };
  }
}

function mountSummaryBox(block) {
  const col = block.querySelector('.checkout-shipping--summary-col.panel-wrapper');
  if (!col) return null;
  const existing = col.querySelector('.checkout-shipping-summary-box');
  if (existing) return existing;
  const box = document.createElement('div');
  box.className = 'checkout-shipping-summary-box';
  col.appendChild(box);
  return box;
}

function refreshSummary(block) {
  const box = mountSummaryBox(block);
  if (!box) return;
  const cart = (typeof window.getDataLayerProperty === 'function' && window.getDataLayerProperty('cart')) || { productCount: 0, products: {}, subTotal: 0, total: 0 };
  const subtotal = cart.subTotal ?? cart.total ?? 0;
  box.innerHTML = `
    <div class="checkout-shipping-summary-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
    <div class="checkout-shipping-summary-row"><span>Shipping</span><span>—</span></div>
    <div class="checkout-shipping-summary-row"><span>Discount</span><span>—</span></div>
    <div class="checkout-shipping-summary-row checkout-shipping-summary-total"><span>Total</span><span>${formatMoney(subtotal)}</span></div>
  `;
}

function prefillFromRegistration(block) {
  try {
    const raw = localStorage.getItem('project_registered_user');
    if (!raw) return;
    const u = JSON.parse(raw);
    const form = block.querySelector('form');
    if (!form) return;
    ['firstName', 'lastName', 'email', 'phone'].forEach((n) => {
      const el = form.querySelector(`[name="${n}"]`);
      if (el && u[n]) el.value = u[n];
    });
  } catch {
    /* ignore */
  }
}

function getBackPath(config) {
  const raw = (config['back-path'] || config.backpath || '').toString().trim();
  if (!raw) return null;
  if (raw.startsWith('/content/') || /^https?:\/\//i.test(raw)) return normalizeAemPath(raw);
  return null;
}

function attachBackButton(block, config) {
  const backBtn = block.querySelector('#btn-back');
  if (!backBtn || backBtn.tagName !== 'BUTTON') return;
  backBtn.type = 'button';
  backBtn.addEventListener('click', () => {
    const targetPath = getBackPath(config);
    if (targetPath) window.location.href = targetPath;
  });
}

function attachCardNumberVisibility(block) {
  const form = block.querySelector('form');
  if (!form) return;

  const cardNumberInput = form.querySelector('[name="cardNumber"]');
  const cardNumberWrapper = cardNumberInput?.closest('.field-wrapper');
  if (!cardNumberInput || !cardNumberWrapper) return;

  const syncVisibility = () => {
    const paymentMethod = getRadioValue(form, 'paymentMethod', 'paymentMethod');
    const showCardNumber = String(paymentMethod).toLowerCase() === 'card';
    cardNumberWrapper.style.display = showCardNumber ? '' : 'none';
    if (!showCardNumber) {
      cardNumberInput.value = '';
      cardNumberInput.classList.remove('field-invalid');
    }
  };

  form.querySelectorAll('input[type="radio"][name="paymentMethod_paymentMethod"]').forEach((radio) => {
    radio.addEventListener('change', syncVisibility);
  });

  syncVisibility();
}

function persistShippingStep(data) {
  try {
    sessionStorage.setItem('checkout_shipping_step', JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}

function isElementAvailableAndVisible(el) {
  if (!el || !el.isConnected || el.hidden) return false;
  const wrapper = el.closest('.checkbox-wrapper, .field-wrapper') || el;
  const style = window.getComputedStyle(wrapper);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  return wrapper.getClientRects().length > 0;
}

function attachSubmitHandler(block, config) {
  const form = block.querySelector('form');
  if (!form) return;

  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      const data = collectCheckoutShippingData(form);
      persistShippingStep(data);

      const shipping = mapShippingSelection(data.shippingMethod);
      const paymentType = mapPaymentType(data.paymentMethod);
      const createAccountConsent = Boolean(data.createAccount);
      const lumaLoyaltyControl = form.querySelector('[name="lumaLoyalty"]');
      const shouldSendJoinLumaLoyaltyConsent = isElementAvailableAndVisible(lumaLoyaltyControl);
      const joinLumaLoyaltyConsent = Boolean(data.lumaLoyalty);
      const baseFormUpdates = buildFormDataLayerUpdates(form, DEFAULT_FORM_FIELD_MAP) || {};

      if (typeof window.updateDataLayer === 'function') {
        window.updateDataLayer(
          {
            ...baseFormUpdates,
            commerce: {
              shipping,
            },
            paymentType,
            createAccountConsent,
            ...(shouldSendJoinLumaLoyaltyConsent ? { joinLumaLoyaltyConsent } : {}),
          },
          true
        );
      }

      const submitBtn = form.querySelector("button[type='submit']");
      const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
      if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
        const sheetData = await fetchButtonDataSheet(buttonDataUrl);
        if (sheetData) window.updateDataLayer(sheetData);
      }
      const authoredEvent = submitBtn?.dataset?.buttonEventType?.trim();
      if (authoredEvent) dispatchCustomEvent(authoredEvent);

      const continuePath = (config['continue-path'] || config.continuepath || '').toString().trim();
      setTimeout(() => {
        if (continuePath && (continuePath.startsWith('/content/') || /^https?:\/\//i.test(continuePath))) {
          window.location.href = normalizeAemPath(continuePath);
        }
      }, 1000);
    }
  );
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  const showCardNumberField = isTruthy(config.showcardnumberfield ?? config['show-card-number-field']);
  const showLoyalty = isTruthy(config['show-loyalty'] ?? config.showloyalty);
  const loyaltyLabel = (config['loyalty-label'] || config.loyaltylabel || 'I want to join Luma+ Loyalty Program').toString().trim();
  [...block.children].forEach((row) => {
    row.style.display = 'none';
  });

  block.classList.add('checkout-shipping-block');

  const formDef = {
    id: 'checkout-shipping',
    fieldType: 'form',
    appliedCssClassNames: 'checkout-shipping-form',
    items: [
      {
        id: 'heading-checkout',
        fieldType: 'heading',
        label: { value: 'CHECKOUT' },
        appliedCssClassNames: 'col-12 checkout-shipping-page-title',
      },
      {
        id: 'panel-columns',
        name: 'columns',
        fieldType: 'panel',
        properties: { colspan: 12 },
        appliedCssClassNames: 'checkout-shipping-columns',
        items: [
          {
            id: 'col-personal',
            name: 'personal',
            fieldType: 'panel',
            properties: { colspan: 4 },
            appliedCssClassNames: 'checkout-shipping--personal-col',
            items: [
              {
                id: 'h-personal',
                fieldType: 'heading',
                label: { value: 'Personal information' },
                appliedCssClassNames: 'col-12 checkout-shipping-subheading',
              },
              {
                id: 'firstName',
                name: 'firstName',
                fieldType: 'text-input',
                label: { value: 'First name' },
                properties: { colspan: 6 },
              },
              {
                id: 'lastName',
                name: 'lastName',
                fieldType: 'text-input',
                label: { value: 'Last name' },
                properties: { colspan: 6 },
              },
              {
                id: 'email',
                name: 'email',
                fieldType: 'text',
                label: { value: 'Email' },
                properties: { colspan: 6 },
              },
              {
                id: 'phone',
                name: 'phone',
                fieldType: 'text-input',
                label: { value: 'Phone number' },
                properties: { colspan: 6 },
              },
              {
                id: 'street',
                name: 'streetAddress',
                fieldType: 'text-input',
                label: { value: 'Street address' },
                properties: { colspan: 6 },
              },
              {
                id: 'city',
                name: 'city',
                fieldType: 'text-input',
                label: { value: 'City' },
                properties: { colspan: 6 },
              },
              {
                id: 'postalCode',
                name: 'zipCode',
                fieldType: 'text-input',
                label: { value: 'Postal code' },
                properties: { colspan: 6 },
              },
              {
                id: 'country',
                name: 'country',
                fieldType: 'drop-down',
                label: { value: 'Country' },
                type: 'string',
                enum: ['', 'US', 'CA', 'GB', 'DE', 'FR'],
                enumNames: ['Select...', 'United States', 'Canada', 'United Kingdom', 'Germany', 'France'],
                properties: { colspan: 6 },
              },
            ],
          },
          {
            id: 'col-payment-shipping',
            name: 'paymentShipping',
            fieldType: 'panel',
            properties: { colspan: 4 },
            appliedCssClassNames: 'checkout-shipping--payment-col',
            items: [
              {
                id: 'paymentMethod',
                name: 'paymentMethod',
                fieldType: 'radio-group',
                label: { value: 'Payment' },
                type: 'string',
                value: 'card',
                enum: ['card', 'paypal'],
                enumNames: ['Credit or Debit Card', 'Paypal'],
                properties: { 'afs:layout': { orientation: 'vertical' } },
                appliedCssClassNames: 'col-12',
              },
              ...(showCardNumberField
                ? [
                    {
                      id: 'cardNumber',
                      name: 'cardNumber',
                      fieldType: 'text-input',
                      label: { value: 'Card number' },
                      properties: { colspan: 12 },
                      appliedCssClassNames: 'col-12 checkout-shipping-card-number',
                    },
                  ]
                : []),
              {
                id: 'shippingMethod',
                name: 'shippingMethod',
                fieldType: 'radio-group',
                label: { value: 'Shipping' },
                type: 'string',
                value: 'standard',
                enum: ['standard', 'ground', 'priority', 'express', 'pickup'],
                enumNames: [
                  'Standard: 5-14 business days',
                  'Ground: 3-7 business days',
                  'Priority: 2 business days',
                  'Express: 1 business day',
                  'Next-day pickup',
                ],
                properties: { 'afs:layout': { orientation: 'vertical' } },
                appliedCssClassNames: 'col-12',
              },
            ],
          },
          {
            id: 'col-summary',
            name: 'summary',
            fieldType: 'panel',
            properties: { colspan: 4 },
            appliedCssClassNames: 'checkout-shipping--summary-col',
            items: [
              {
                id: 'h-account',
                fieldType: 'heading',
                label: { value: 'Account' },
                appliedCssClassNames: 'col-12 checkout-shipping-subheading',
              },
              ...(showLoyalty
                ? [
                    {
                      id: 'lumaLoyalty',
                      name: 'lumaLoyalty',
                      fieldType: 'checkbox',
                      label: { value: loyaltyLabel },
                      enum: ['true'],
                      type: 'string',
                      properties: {
                        variant: 'switch',
                        alignment: 'horizontal',
                        colspan: 12,
                      },
                    },
                  ]
                : []),
              {
                id: 'createAccount',
                name: 'createAccount',
                fieldType: 'checkbox',
                label: { value: 'I want to create the account' },
                enum: ['true'],
                type: 'string',
                properties: {
                  variant: 'switch',
                  alignment: 'horizontal',
                  colspan: 12,
                },
              },
              {
                id: 'h-summary',
                fieldType: 'heading',
                label: { value: 'Summary' },
                appliedCssClassNames: 'col-12 checkout-shipping-subheading',
              },
            ],
          },
        ],
      },
      {
        id: 'panel-actions',
        name: 'actions',
        fieldType: 'panel',
        properties: { colspan: 12 },
        appliedCssClassNames: 'checkout-shipping-actions-panel',
        items: [
          {
            id: 'btn-back',
            name: 'back',
            fieldType: 'button',
            buttonType: 'button',
            label: { value: 'BACK' },
            appliedCssClassNames: 'submit-wrapper col-6',
          },
          {
            id: 'btn-continue',
            name: 'continue',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'CONTINUE' },
            appliedCssClassNames: 'submit-wrapper col-6',
          },
        ],
      },
    ],
  };

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

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    prefillFromRegistration(block);
    attachBackButton(block, config);
    attachCardNumberVisibility(block);
    refreshSummary(block);
    attachSubmitHandler(block, config);
  }, 120);
}
