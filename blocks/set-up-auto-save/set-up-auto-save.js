import { readBlockConfig } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { normalizeAemPath } from '../../scripts/scripts.js';
import { fetchButtonDataSheet } from '../../scripts/form-data-layer.js';


function getRedirectUrl(block, config) {
  const fromConfig = (config.redirecturl ?? '').toString().trim();
  if (fromConfig) return fromConfig;
  const propEl = block.querySelector('[data-aue-prop="redirectUrl"]');
  if (propEl) {
    const a = propEl.querySelector('a[href]');
    const href = a?.getAttribute('href')?.trim();
    if (href) return href;
    const text = (propEl.textContent || propEl.innerText || '').trim();
    if (text) return text;
  }
  return '';
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

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  const redirectUrl = normalizeAemPath(getRedirectUrl(block, config));

  const formDef = {
    id: "set-up-auto-save",
    fieldType: "form",
    appliedCssClassNames: "set-up-auto-save-form",
    ...(redirectUrl && { redirectUrl }),
    items: [
      {
        id: "heading-set-up-auto-save",
        fieldType: "heading",
        label: { value: "Set up auto save" },
        appliedCssClassNames: "col-12",
      },
      {
        id: "panel-main",
        name: "main",
        fieldType: "panel",
        items: [
          {
            id: "transfer-from",
            name: "transferFrom",
            fieldType: "drop-down",
            label: { value: "Transfer from" },
            enum: ["Checking Account"],
            value: "Checking Account",
            properties: { colspan: 12 },
          },
          {
            id: "transfer-to",
            name: "transferTo",
            fieldType: "drop-down",
            label: { value: "Transfer to" },
            enum: ["Retirement Account"],
            value: "Retirement Account",
            properties: { colspan: 12 },
          },
          {
            id: "amount",
            name: "amount",
            fieldType: "text-input",
            label: { value: "Amount" },
            value: "$100.00",
            properties: { colspan: 12 },
          },
          {
            id: "objective",
            name: "objective",
            fieldType: "checkbox-group",
            label: { value: "Objective" },
            enum: [
              "Build emergency fund",
              "Establish a budget",
              "Pay off credit cards",
              "Save for college",
            ],
            properties: { colspan: 12 },
          },
          {
            id: "submit-btn",
            name: "submitButton",
            fieldType: "button",
            buttonType: "submit",
            label: { value: "Submit" },
            appliedCssClassNames: "submit-wrapper col-12",
          },
        ],
      },
    ],
  };

  const formContainer = document.createElement("div");
  formContainer.className = "form";

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.replaceChildren(formContainer);

  const formModule = await import("../form/form.js");
  await formModule.default(formContainer);

  const form = formContainer.querySelector("form");
  if (form) {
    applyButtonConfigToSubmitButton(block, config, 'auto-save-form-submit');
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton?.addEventListener("click", async () => {
      const buttonDataUrl = submitButton?.dataset?.buttonData?.trim();
      if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
        const sheetData = await fetchButtonDataSheet(buttonDataUrl);
        if (sheetData) window.updateDataLayer(sheetData);
      }
      const authoredEventType = submitButton?.dataset?.buttonEventType?.trim() || 'auto-save-form-submit';
      dispatchCustomEvent(authoredEventType);
      if (redirectUrl) {
        setTimeout(() => { window.location.href = redirectUrl; }, 2000);
      }
    });
  }
}
