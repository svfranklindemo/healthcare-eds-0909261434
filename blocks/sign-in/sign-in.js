import { normalizeAemPath } from "../../scripts/scripts.js";
import { readBlockConfig } from "../../scripts/aem.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync, submitToWebhook, fetchButtonDataSheet } from "../../scripts/form-data-layer.js";

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

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  /* Hide button config rows on published/live */
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  // Prepare logo image if authored
  const logoImage = config.logoImage ?? config['logo-image'];
  const logoAlt = config.logoImageAlt ?? config['logo-image-alt'] ?? '';
  let logoWrapper = null;
  if (logoImage) {
    logoWrapper = document.createElement('div');
    logoWrapper.className = 'sign-in-logo';
    const img = document.createElement('img');
    img.src = logoImage;
    img.alt = logoAlt;
    logoWrapper.append(img);
  }

  const signInBtnText = config.signInBtnText ?? config['sign-in-btn-text'] ?? 'SIGN IN';

  // Set authorable redirect URLs
  const signInRedirectUrl = normalizeAemPath(config['sign-in-redirect-url']);
  block.dataset.signInRedirectUrl = signInRedirectUrl;

  // Set authorable create account URL
  const createAccountUrl = normalizeAemPath(config['create-account-url']);
  block.dataset.createAccountUrl = createAccountUrl;

  // Build Adaptive Form definition for Sign In
  const formDef = {
    id: "sign-in",
    fieldType: "form",
    appliedCssClassNames: "sign-in-form",
    items: [
      {
        id: "heading-sign-in",
        fieldType: "heading",
        label: { value: "Sign in to your account" },
        appliedCssClassNames: "col-12",
      },
      {
        id: "panel-main",
        name: "main",
        fieldType: "panel",
        items: [
          {
            id: "email",
            name: "email",
            fieldType: "text-input",
            label: { value: "Email address" },
            required: true,
            autoComplete: "email",
            properties: { colspan: 12 },
          },
          {
            id: "password",
            name: "password",
            fieldType: "password-input",
            label: { value: "Password" },
            required: true,
            autoComplete: "current-password",
            properties: { colspan: 12 },
          },
          {
            id: "sign-in-btn",
            name: "signInButton",
            fieldType: "button",
            buttonType: "submit",
            label: { value: signInBtnText },
            appliedCssClassNames: "submit-wrapper col-12",
          },
        ],
      },
    ],
  };

  // Create a child form block that reuses the existing form renderer
  const formContainer = document.createElement("div");
  formContainer.className = "form";

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.replaceChildren(formContainer);
  if (logoWrapper) {
    block.prepend(logoWrapper);
  }

  const formModule = await import("../form/form.js");
  await formModule.default(formContainer);

  // Wait for form to be rendered before attaching handlers
  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    attachSignInHandler(block);
    addCreateAccountLink(block, config);
  }, 100);
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Prefills the email field using stored registration data
 * @param {HTMLFormElement} form - The sign-in form element
 */
function prefillEmail(form) {
  if (!form) return;
  const emailInput = form.querySelector('input[name="email"]');
  if (!emailInput) return;

  const candidateKeys = ["com.adobe.reactor.dataElements.Profile - Email"];

  let storedEmail = "";

  for (const key of candidateKeys) {
    const value = localStorage.getItem(key);
    if (value && typeof value === "string" && value.trim()) {
      storedEmail = value;
      break;
    }
  }

  if (!storedEmail) {
    try {
      const reg = JSON.parse(localStorage.getItem("project_registered_user") || "{}");
      if (reg.email) storedEmail = reg.email;
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  if (storedEmail) {
    const cleanedEmail = storedEmail.replace(/[\*\"\']/g, "").trim();
    if (isValidEmail(cleanedEmail)) {
      emailInput.value = cleanedEmail;
    }
  }
}

/**
 * Attaches sign-in form submission handler
 * @param {HTMLElement} block - The sign-in block
 */
function attachSignInHandler(block) {
  let form = block.querySelector("form");
  if (!form) {
    console.warn("Sign-in form not found");
    return;
  }

  // Clone the form to remove all existing event listeners (including form component's submit handler)
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  form = newForm; // Update reference to use the new form

  prefillEmail(form);
  syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
  attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);

  // Now attach our custom submit handler to the clean form
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Get form values
    const emailInput = form.querySelector('input[name="email"]');
    const passwordInput = form.querySelector('input[name="password"]');

    if (!emailInput || !passwordInput) {
      showErrorMessage(form, "Form fields not found");
      return;
    }

    const enteredEmail = emailInput.value.trim();
    const enteredPassword = passwordInput.value;

    // Validate email format
    if (!isValidEmail(enteredEmail)) {
      showErrorMessage(form, "Please enter a valid email address");
      emailInput.focus();
      return;
    }

    // Validate password is not empty
    if (!enteredPassword || enteredPassword.trim() === "") {
      showErrorMessage(form, "Please enter your password");
      passwordInput.focus();
      return;
    }

    // Sign-in successful - Load user data from registration
    try {
      // Set authentication flag in localStorage
      localStorage.setItem("project_user_logged_in", "true");

      localStorage.setItem(
        "com.adobe.reactor.dataElements.Identities",
        JSON.stringify({
          Email: [
            {
              id: enteredEmail,
              primary: true,
              authenticatedState: "authenticated",
            },
          ],
        })
      );

      sessionStorage.setItem(
        "com.adobe.reactor.dataElements.Identity Map",
        JSON.stringify({
          Email: [
            {
              id: enteredEmail,
              primary: true,
              authenticatedState: "authenticated",
            },
          ],
        })
      );

      // If button has an authored event type, fire it (for Launch, same pattern as flight-search)
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      const submitBtn = form.querySelector("button[type='submit']");
      const buttonDataUrl = submitBtn?.dataset?.buttonData?.trim();
      if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
        const sheetData = await fetchButtonDataSheet(buttonDataUrl);
        if (sheetData) window.updateDataLayer(sheetData);
      }
      const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim();
      if (authoredEventType) {
        dispatchCustomEvent(authoredEventType);
      }

      const webhookUrl = submitBtn?.dataset?.buttonWebhookUrl?.trim();
      const formId = submitBtn?.dataset?.buttonFormId?.trim();
      if (webhookUrl) await submitToWebhook(form, webhookUrl, formId);

      // Show success message
      showSuccessMessage(form, "Sign-in successful! Redirecting...");

      // Redirect to authored URL or default to home page after delay (allows custom/analytics calls to complete)
      const redirectUrl = block.dataset.signInRedirectUrl;
      if (redirectUrl) setTimeout(() => { window.location.href = redirectUrl; }, 2000);
    } catch (error) {
      console.error("Sign-in error:", error);
      showErrorMessage(form, "Sign-in failed. Please try again.");
    }
  });
}

/**
 * Shows success message
 * @param {HTMLFormElement} form - The form element
 * @param {string} message - Success message
 */
function showSuccessMessage(form, message) {
  // Remove any existing messages
  const existingMessages = form.querySelectorAll(".form-message");
  existingMessages.forEach((msg) => msg.remove());

  const messageEl = document.createElement("div");
  messageEl.className = "form-message success";
  messageEl.textContent = message;
  messageEl.style.cssText = `
    padding: 15px;
    margin: 20px 0;
    background-color: #4caf50;
    color: white;
    border-radius: 4px;
    text-align: center;
    font-weight: bold;
    animation: slideDown 0.3s ease-out;
  `;

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    const submitWrapper = submitButton.closest('.submit-wrapper') || submitButton.parentNode;
    submitWrapper.parentNode.insertBefore(messageEl, submitWrapper);
    submitButton.disabled = true;
  } else {
    form.appendChild(messageEl);
  }
}

/**
 * Shows error message
 * @param {HTMLFormElement} form - The form element
 * @param {string} message - Error message
 */
function showErrorMessage(form, message) {
  // Remove any existing messages
  const existingMessages = form.querySelectorAll(".form-message");
  existingMessages.forEach((msg) => msg.remove());

  const messageEl = document.createElement("div");
  messageEl.className = "form-message error";
  messageEl.textContent = message;
  messageEl.style.cssText = `
    padding: 15px;
    margin: 20px 0;
    background-color: #f44336;
    color: white;
    border-radius: 4px;
    text-align: center;
    font-weight: bold;
    animation: slideDown 0.3s ease-out;
  `;

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    const submitWrapper = submitButton.closest('.submit-wrapper') || submitButton.parentNode;
    submitWrapper.parentNode.insertBefore(messageEl, submitWrapper);
  } else {
    form.appendChild(messageEl);
  }

  // Auto-remove error message after 5 seconds
  setTimeout(() => {
    messageEl.remove();
  }, 5000);
}

function addCreateAccountLink(block, config = {}) {
  const formElement = block.querySelector("form");
  if (!formElement) return;

  // Create "Create account" link section
  const linkSection = document.createElement("div");
  linkSection.className = "sign-in-links";

  // Divider
  const divider = document.createElement("div");
  divider.className = "sign-in-divider";
  divider.innerHTML = "<span>or</span>";

  // Create account link only when a full AEM path is authored
  const createAccountLink = document.createElement("a");
  createAccountLink.className = "create-account-link";
  const isCarveloTheme = document.body.classList.contains("carvelo-theme");
  createAccountLink.textContent = isCarveloTheme ? "Don't have an account? Register" : "Create an account";

  const registrationPath = (config['create-account-url'] ?? block.dataset.createAccountUrl ?? '').toString().trim();
  if (!registrationPath.startsWith('/content/') && !/^https?:\/\//i.test(registrationPath)) return;
  createAccountLink.href = normalizeAemPath(registrationPath);

  linkSection.append(divider, createAccountLink);
  formElement.parentElement.append(linkSection);
}
