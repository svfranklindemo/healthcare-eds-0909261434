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

function buildChildAccountApplicationFormDef() {
  return {
    id: "child-account-application",
    fieldType: "form",
    appliedCssClassNames: "child-account-application-form",
    items: [
      {
        id: "heading-child-information",
        fieldType: "heading",
        label: { value: "Child's Information Confirmation" },
        appliedCssClassNames: "col-12",
      },
      {
        id: "panel-main",
        name: "main",
        fieldType: "panel",
        items: [
          {
            id: "childFirstName",
            name: "childFirstName",
            fieldType: "text-input",
            label: { value: "First name" },
            properties: { colspan: 6 },
          },
          {
            id: "childLastName",
            name: "childLastName",
            fieldType: "text-input",
            label: { value: "Last name" },
            properties: { colspan: 6 },
          },
          {
            id: "heading-parent-information",
            fieldType: "heading",
            label: { value: "Parent/Guardian Information" },
            appliedCssClassNames: "col-12 section-heading",
          },
          {
            id: "parentFirstName",
            name: "parentFirstName",
            fieldType: "text-input",
            label: { value: "First name" },
            properties: { colspan: 6 },
          },
          {
            id: "parentLastName",
            name: "parentLastName",
            fieldType: "text-input",
            label: { value: "Last name" },
            properties: { colspan: 6 },
          },
          {
            id: "relationshipToChild",
            name: "relationshipToChild",
            fieldType: "drop-down",
            label: { value: "Relationship to Child" },
            enum: ["", "mother", "father", "legal-guardian", "other"],
            enumNames: ["Select...", "Mother", "Father", "Legal Guardian", "Other"],
            type: "string",
            properties: { colspan: 12 },
          },
          {
            id: "heading-consent",
            fieldType: "heading",
            label: { value: "Consent & Agreements" },
            appliedCssClassNames: "col-12 section-heading",
          },
          {
            id: "confirmInformation",
            name: "confirmInformation",
            fieldType: "checkbox",
            label: { value: "I confirm that the information provided above is accurate." },
            enum: ["true"],
            type: "string",
            properties: { colspan: 12 },
          },
          {
            id: "consentAccountOperation",
            name: "consentAccountOperation",
            fieldType: "checkbox",
            label: { value: "I consent to the continued operation of my child's account in accordance with SecurFinancial's Terms and Conditions." },
            enum: ["true"],
            type: "string",
            properties: { colspan: 12 },
          },
          {
            id: "acknowledgeFeatureChanges",
            name: "acknowledgeFeatureChanges",
            fieldType: "checkbox",
            label: { value: "I acknowledge and agree to any changes in account features applicable to account holders aged 13 and above." },
            enum: ["true"],
            type: "string",
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

  const formDef = buildChildAccountApplicationFormDef();
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
    applyButtonConfigToSubmitButton(block, config, "form.childAccountUpgrade.submitted");
    attachDataLayerUpdaters(block);
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
      const allFields = form.querySelectorAll("input, select, textarea");
      allFields.forEach((field) => {
        const fieldName = field.name || field.id;
        if (!fieldName) return;
        if (field.type === "checkbox") {
          formData[fieldName] = field.checked ? field.value || "true" : "";
        } else {
          formData[fieldName] = field.value;
        }
      });

      try {
        const submitData = {
          ...formData,
          submittedAt: new Date().toISOString(),
          submissionId: generateSubmissionId(),
        };

        localStorage.setItem("child_account_application", JSON.stringify(submitData));

        const submitBtn = form.querySelector("button[type='submit']");
        const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
        if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
          const sheetData = await fetchButtonDataSheet(buttonDataUrl);
          if (sheetData) window.updateDataLayer(sheetData);
        }
        const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim() || "form.childAccountUpgrade.submitted";
        dispatchCustomEvent(authoredEventType);

        const url = normalizeAemPath(redirectUrl);
        if (url) setTimeout(() => { window.location.href = url; }, 1000);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Child account application error:", error);
        showErrorMessage(form, "Submission failed. Please try again.");
      }
    }
  );
}

function generateSubmissionId() {
  return `child_account_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getSuccessRedirectPath() {
  const authorPath = "/content/secur-financial/language-masters/en/child-account-application-step-1/child-account-upgrade-submitted.html";

  if (isAuthorEnvironment()) {
    return authorPath;
  }

  const { langCode, prefix } = getPathDetails();
  const language = langCode || "en";
  return prefix
    ? `${prefix}/${language}/child-account-application-step-1/child-account-upgrade-submitted`
    : `/${language}/child-account-application-step-1/child-account-upgrade-submitted`;
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

const fieldToDataLayerMap = {
  parentFirstName: "person.name.firstName",
  parentLastName: "person.name.lastName",
};

function updateDataLayerField(fieldName, value) {
  if (!window.updateDataLayer) return;
  const dataLayerPath = fieldToDataLayerMap[fieldName];
  if (!dataLayerPath) return;

  const pathParts = dataLayerPath.split(".");
  const updateObj = {};
  let current = updateObj;

  for (let i = 0; i < pathParts.length - 1; i += 1) {
    current[pathParts[i]] = {};
    current = current[pathParts[i]];
  }

  if (fieldName === "confirmInformation" || fieldName === "consentAccountOperation" || fieldName === "acknowledgeFeatureChanges") {
    current[pathParts[pathParts.length - 1]] = value === "true" || value === true;
  } else {
    current[pathParts[pathParts.length - 1]] = value || "";
  }

  window.updateDataLayer(updateObj);
}

function handleFieldUpdate(fieldName, field) {
  if (field.type === "checkbox") {
    updateDataLayerField(fieldName, field.checked ? field.value || "true" : "");
    return;
  }
  updateDataLayerField(fieldName, field.value);
}

function attachDataLayerUpdaters(block) {
  const form = block.querySelector("form");
  if (!form) return;

  const fields = form.querySelectorAll("input, select, textarea");
  fields.forEach((field) => {
    const fieldName = field.name || field.id;
    if (!fieldName) return;

    if (field.type === "checkbox" || field.type === "radio" || field.tagName.toLowerCase() === "select") {
      field.addEventListener("change", () => handleFieldUpdate(fieldName, field));
    } else {
      field.addEventListener("blur", () => handleFieldUpdate(fieldName, field));
    }
  });
}
