function hasData(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function normalizeValue(value) {
  if (typeof value === 'string') return value.trim();
  return value;
}

function setNestedValue(target, path, value) {
  const parts = path.split('.');
  let current = target;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (i === parts.length - 1) {
      current[part] = value;
    } else {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
  }
}

export const DEFAULT_FORM_FIELD_MAP = {
  firstName: 'person.name.firstName',
  lastName: 'person.name.lastName',
  email: 'personalEmail.address',
  phone: 'mobilePhone.number',
  streetAddress: 'homeAddress.street1',
  city: 'homeAddress.city',
  zipCode: 'homeAddress.postalCode',
  state: 'homeAddress.state',
  country: 'homeAddress.country',
  dateOfBirth: 'person.birthDate',
  gender: 'person.gender',
  jointApplicant: 'enrollment.jointApplicant',
  ssn: 'profile.ssn',
  patientNumber: 'memberId',
  isMember: 'person.isMember',
  wkndFlyMember: 'person.wkndFlyMember',
  emailComm: 'consents.marketing.email.val',
  prefEmail: 'consents.marketing.email.val',
  prefPhone: 'consents.marketing.call.val',
  prefSms: 'consents.marketing.sms.val',
};

export function buildFormDataLayerUpdates(form, fieldMap) {
  if (!form || !fieldMap) return null;
  const updates = {};
  Object.entries(fieldMap).forEach(([fieldName, path]) => {
    let element = form.querySelector(`[name="${fieldName}"]`);
    if (!element && form.elements) {
      element = form.elements[fieldName];
    }
    if (!element) return;
    const rawValue = element.type === 'checkbox' ? (element.checked ? element.value : '') : element.value;
    const value = normalizeValue(rawValue);
    if (!hasData(value)) return;
    setNestedValue(updates, path, value);
    if (fieldName === 'isMember' && typeof value === 'string') {
      setNestedValue(updates, 'person.isMember', value);
    }
  });
  return Object.keys(updates).length ? updates : null;
}

export function syncFormDataLayer(form, fieldMap) {
  if (!form || !fieldMap || typeof window === 'undefined' || !window.updateDataLayer) return;
  const updates = buildFormDataLayerUpdates(form, fieldMap);
  if (!updates) return;
  window.updateDataLayer(updates);
}

export async function submitToWebhook(form, webhookUrl, formId) {
  const payload = buildFormDataLayerUpdates(form, DEFAULT_FORM_FIELD_MAP) || {};
  if (formId) payload['form-name'] = formId;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Webhook submission failed:', e);
  }
}

export async function fetchButtonDataSheet(url) {
  if (!url) return null;
  try {
    const fetchUrl = url.endsWith('.json') ? url : `${url}.json`;
    const resp = await fetch(fetchUrl);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!Array.isArray(json.data)) return null;
    const result = {};
    json.data.forEach(({ key, value }) => { if (key) setNestedValue(result, key, value); });
    return result;
  } catch {
    return null;
  }
}

export function attachLiveFormSync(form, fieldMap) {
  if (!form || !fieldMap) return;
  const handler = () => syncFormDataLayer(form, fieldMap);
  const fields = form.querySelectorAll('input, select, textarea');
  fields.forEach((field) => {
    const eventType = field.type === 'text' || field.type === 'email' || field.tagName.toLowerCase() === 'textarea' ? 'blur' : 'change';
    field.addEventListener(eventType, handler);
    if (eventType === 'change') {
      field.addEventListener('input', handler);
    }
  });
}
