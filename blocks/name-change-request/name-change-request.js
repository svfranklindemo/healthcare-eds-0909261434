import { readBlockConfig } from "../../scripts/aem.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync, fetchButtonDataSheet } from "../../scripts/form-data-layer.js";
import { isAuthorEnvironment, normalizeAemPath } from "../../scripts/scripts.js";
import { getPathDetails } from "../../scripts/utils.js";

function applyButtonConfigToSubmitButton(block, config) {
  const submitButton = block.querySelector("form button[type='submit']");
  if (!submitButton) return;
  const eventType = config.buttoneventtype ?? config["button-event-type"];
  const normalizedEvent = eventType && String(eventType).trim();
  if (normalizedEvent) submitButton.dataset.buttonEventType = normalizedEvent;
  const webhookUrl = config.buttonwebhookurl ?? config["button-webhook-url"];
  if (webhookUrl && String(webhookUrl).trim()) submitButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid ?? config["button-form-id"];
  if (formId && String(formId).trim()) submitButton.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata ?? config["button-data"];
  if (buttonData && String(buttonData).trim()) submitButton.dataset.buttonData = String(buttonData).trim();
}

function buildNameChangeRequestFormDef() {
  return {
    id: "name-change-request",
    fieldType: "form",
    appliedCssClassNames: "name-change-request-form",
    items: [
      {
        id: "heading-name-change-request",
        fieldType: "heading",
        label: { value: "Name change request" },
        appliedCssClassNames: "col-12",
      },
      {
        id: "panel-main",
        name: "main",
        fieldType: "panel",
        items: [
          {
            id: "reasonLabel",
            fieldType: "plain-text",
            value: "What is the reason for your name change?",
            appliedCssClassNames: "col-12 name-change-request-question",
          },
          {
            id: "reasonForNameChange",
            name: "reasonForNameChange",
            fieldType: "checkbox-group",
            enum: ["marriage", "divorce", "legal-name-change", "first-or-middle-name-correction", "naturalization"],
            enumNames: ["Marriage", "Divorce", "Legal name change", "First or middle name correction", "Naturalization"],
            type: "string[]",
            orientation: "vertical",
            properties: { colspan: 12 },
          },
          {
            id: "identityDocument",
            name: "identityDocument",
            fieldType: "file-input",
            label: { value: "Identity document" },
            type: "file",
            accept: ["image/*", "application/pdf"],
            properties: {
              colspan: 12,
              "fd:buttonText": "Upload identity document",
              dragDropText: "",
            },
          },
          {
            id: "firstName",
            name: "firstName",
            fieldType: "text-input",
            label: { value: "First name" },
            properties: { colspan: 6 },
          },
          {
            id: "middleName",
            name: "middleName",
            fieldType: "text-input",
            label: { value: "Middle name" },
            properties: { colspan: 6 },
          },
          {
            id: "lastName",
            name: "lastName",
            fieldType: "text-input",
            label: { value: "Last name" },
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
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  [...block.children].forEach((row) => { row.style.display = "none"; });

  const formDef = buildNameChangeRequestFormDef();
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

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config, "form-submit");
    attachSubmitHandler(block, config.redirecturl);
    const form = block.querySelector("form");
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);
    }
  }, 100);
}

function attachSubmitHandler(block, redirectUrl) {
  const form = block.querySelector("form");
  if (!form) return;

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const formData = {};
      form.querySelectorAll("input, select, textarea").forEach((field) => {
        const fieldName = field.name || field.id;
        if (!fieldName) return;

        if (field.type === "checkbox") {
          const checkboxes = form.querySelectorAll(`input[name="${fieldName}"]`);
          if (checkboxes.length > 1) {
            formData[fieldName] = Array.from(checkboxes)
              .filter((cb) => cb.checked)
              .map((cb) => cb.value);
          } else {
            formData[fieldName] = field.checked ? field.value || "true" : "";
          }
        } else if (field.type === "file") {
          formData[fieldName] = field.files?.length ? Array.from(field.files).map((file) => file.name) : [];
        } else {
          formData[fieldName] = field.value;
        }
      });

      try {
        localStorage.setItem(
          "name_change_request",
          JSON.stringify({
            ...formData,
            submittedAt: new Date().toISOString(),
            requestId: `name_change_${Date.now()}`,
          })
        );

        const submitBtn = form.querySelector("button[type='submit']");
        const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
        if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
          const sheetData = await fetchButtonDataSheet(buttonDataUrl);
          if (sheetData) window.updateDataLayer(sheetData);
        }
        const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim() || "form-submit";
        dispatchCustomEvent(authoredEventType);

        const url = normalizeAemPath(redirectUrl);
        if (url) setTimeout(() => { window.location.href = url; }, 0);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Name change request error:", error);
        showErrorMessage(form, "Submission failed. Please try again.");
      }
    }
  );
}

function getSuccessRedirectPath() {
  const authorPath = "/content/secur-financial/language-masters/en/settings/sign-name-change-request.html";

  if (isAuthorEnvironment()) {
    return authorPath;
  }

  const { langCode, prefix } = getPathDetails();
  const language = langCode || "en";
  return prefix
    ? `${prefix}/${language}/settings/sign-name-change-request`
    : `/${language}/settings/sign-name-change-request`;
}

function showErrorMessage(form, message) {
  const existingMessages = form.querySelectorAll(".form-message");
  existingMessages.forEach((msg) => msg.remove());

  const messageEl = document.createElement("div");
  messageEl.className = "form-message error";
  messageEl.textContent = message;

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.parentNode.insertBefore(messageEl, submitButton);
  } else {
    form.appendChild(messageEl);
  }
}
