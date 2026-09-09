/**
 * Loan Calculator block – Purchase price, Down payment, Term sliders;
 * monthly payment output and Apply now CTA. Interest rate from UE (block config).
 */

import { readBlockConfig } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';

const DEFAULT_INTEREST_RATE = 6.5;
const MIN_PRICE = 100000;
const MAX_PRICE = 3000000;
const MIN_TERM = 5;
const MAX_TERM = 30;

function parseNumber(val, fallback = 0) {
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  let result = value;
  if (Number.isFinite(min) && result < min) result = min;
  if (Number.isFinite(max) && result > max) result = max;
  return result;
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function monthlyPayment(principal, annualRatePercent, termYears) {
  if (principal <= 0) return 0;
  const r = (annualRatePercent / 100) / 12;
  const n = termYears * 12;
  if (r <= 0) return principal / n;
  const factor = r * (1 + r) ** n;
  const denom = (1 + r) ** n - 1;
  return (principal * factor) / denom;
}

function buildSlider(id, label, value, min, max, step, formatter) {
  const wrap = document.createElement('div');
  wrap.className = 'loan-calculator-field';
  const labelEl = document.createElement('label');
  labelEl.className = 'loan-calculator-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'loan-calculator-value';
  valueEl.textContent = formatter ? formatter(value) : value;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step || 1;
  input.value = value;
  input.id = id;
  input.setAttribute('aria-label', label);
  wrap.append(labelEl, valueEl, input);
  return { wrap, valueEl, input };
}

function normalizeConfig(cfg) {
  const interestRateRaw = cfg['interest-rate'];
  const minPriceRaw = cfg['min-price'];
  const maxPriceRaw = cfg['max-price'];
  const minTermRaw = cfg['min-term'];
  const maxTermRaw = cfg['max-term'];
  const minDownRaw = cfg['min-downpayment'];
  const maxDownRaw = cfg['max-downpayment'];
  const applyNowLinkRaw = cfg['apply-now-link'];
  const applyNowTextRaw = cfg['apply-now-text'];
  const descriptionRaw = cfg.description;
  const buttonEventTypeRaw = cfg.buttoneventtype;
  const minPriceValue = parseNumber(minPriceRaw, MIN_PRICE);
  const maxPriceValue = parseNumber(maxPriceRaw, MAX_PRICE);
  const minTermValue = parseNumber(minTermRaw, MIN_TERM);
  const maxTermValue = parseNumber(maxTermRaw, MAX_TERM);
  const minDownValue = parseNumber(minDownRaw, 0);
  const maxDownValue = parseNumber(maxDownRaw, MAX_PRICE);

  return {
    interestRate: parseNumber(interestRateRaw, DEFAULT_INTEREST_RATE),
    applyNowLink: (applyNowLinkRaw ?? '').toString().trim(),
    applyNowText: (applyNowTextRaw ?? 'Apply now').toString().trim(),
    description: (descriptionRaw ?? 'Estimate how much you could be paying monthly for your loan').toString().trim(),
    minPrice: Math.min(minPriceValue, maxPriceValue),
    maxPrice: Math.max(minPriceValue, maxPriceValue),
    minTerm: Math.min(minTermValue, maxTermValue),
    maxTerm: Math.max(minTermValue, maxTermValue),
    minDownPayment: Math.min(minDownValue, maxDownValue),
    maxDownPayment: Math.max(minDownValue, maxDownValue),
    buttonEventType: (buttonEventTypeRaw ?? '').toString().trim(),
  };
}

function fireButtonCustomEventIfConfigured(eventType) {
  if (!eventType) return;
  dispatchCustomEvent(eventType);
}

export default async function decorate(block) {
  const config = normalizeConfig(readBlockConfig(block) || {});
  block.classList.add('loan-calculator-block', 'loan-calculator-block--loading');

  /** Builds calculator UI using config for rate/CTA/description. Call after UE replaces block content. */
  function buildCalculatorRoot() {
    const contentRoot = document.createElement('div');
    contentRoot.className = 'loan-calculator-root';

    const priceRange = { min: config.minPrice, max: config.maxPrice };
    const termRange = { min: config.minTerm, max: config.maxTerm };
    const downRange = { min: config.minDownPayment, max: config.maxDownPayment };

    let purchasePrice = clamp(1028000, priceRange.min, priceRange.max);
    let termYears = clamp(20, termRange.min, termRange.max);
    let downPayment = 100000;

    const getDownBounds = () => {
      const boundMax = Math.min(downRange.max, purchasePrice);
      const boundMin = Math.min(downRange.min, boundMax);
      return {
        min: boundMin,
        max: Math.max(boundMin, boundMax),
      };
    };
    const initialDownBounds = getDownBounds();
    downPayment = clamp(downPayment, initialDownBounds.min, initialDownBounds.max);

    const heading = document.createElement('h2');
    heading.className = 'loan-calculator-heading';
    heading.textContent = 'Calculate your monthly payment';

    const grid = document.createElement('div');
    grid.className = 'loan-calculator-grid';

    const left = document.createElement('div');
    left.className = 'loan-calculator-inputs';

    const formatDownValue = (value) => {
      const pct = purchasePrice > 0 ? Math.round((value / purchasePrice) * 100) : 0;
      return `${formatCurrency(value)} (${pct}%)`;
    };

    const purchase = buildSlider('loan-purchase', 'Purchase price', purchasePrice, priceRange.min, priceRange.max, 1000, formatCurrency);
    purchase.input.addEventListener('input', () => {
      purchasePrice = Number(purchase.input.value);
      purchase.valueEl.textContent = formatCurrency(purchasePrice);
      const { min: newDownMin, max: newDownMax } = getDownBounds();
      down.input.min = newDownMin;
      down.input.max = newDownMax;
      if (downPayment > newDownMax) {
        downPayment = newDownMax;
        down.input.value = downPayment;
        down.valueEl.textContent = formatDownValue(downPayment);
      } else if (downPayment < newDownMin) {
        downPayment = newDownMin;
        down.input.value = downPayment;
        down.valueEl.textContent = formatDownValue(downPayment);
      }
      updatePayment();
    });
    left.append(purchase.wrap);

    const { min: downMin, max: downMax } = initialDownBounds;
    const down = buildSlider('loan-down', 'Down payment', downPayment, downMin, downMax, 1000, formatDownValue);
    down.input.addEventListener('input', () => {
      downPayment = Number(down.input.value);
      down.valueEl.textContent = formatDownValue(downPayment);
      updatePayment();
    });
    left.append(down.wrap);

    const term = buildSlider('loan-term', 'Term', termYears, termRange.min, termRange.max, 1, (v) => `${v} years`);
    term.input.addEventListener('input', () => {
      termYears = Number(term.input.value);
      term.valueEl.textContent = `${termYears} years`;
      updatePayment();
    });
    left.append(term.wrap);

    grid.append(left);

    const right = document.createElement('div');
    right.className = 'loan-calculator-result';
    const amountEl = document.createElement('div');
    amountEl.className = 'loan-calculator-monthly-amount';
    const amountLabel = document.createElement('div');
    amountLabel.className = 'loan-calculator-monthly-label';
    amountLabel.textContent = 'Monthly payment';
    const ctaWrap = document.createElement('div');
    ctaWrap.className = 'loan-calculator-cta';
    const cta = document.createElement('a');
    cta.className = 'loan-calculator-apply-button';
    cta.href = config.applyNowLink || '#';
    cta.textContent = config.applyNowText;
    function pushCalculationFinishEvent() {
      const monthlyPaymentFromDisplay = Math.round(parseNumber(amountEl.textContent, 0));
      const payload = {
        mortgage: {
          term: termYears,
          interestRate: config.interestRate,
          downPayment,
          monthlyPayment: monthlyPaymentFromDisplay,
          price: purchasePrice,
        },
      };
      window.dataLayer = window.dataLayer || [];
      window.updateDataLayer(payload);
    }

    cta.addEventListener('click', (e) => {
      pushCalculationFinishEvent();
      const eventType = config.buttonEventType;
      fireButtonCustomEventIfConfigured(eventType);
      const href = cta.href || '';
      const invalidHref = !href || href === '#' || href.endsWith('#');
      if (invalidHref) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      setTimeout(() => {
        window.location.assign(href);
      }, 2000);
    });
    ctaWrap.append(cta);
    const descEl = document.createElement('p');
    descEl.className = 'loan-calculator-description';
    descEl.textContent = config.description;
    right.append(amountEl, amountLabel, ctaWrap, descEl);
    grid.append(right);

    function updatePayment() {
      const principal = Math.max(0, purchasePrice - downPayment);
      const payment = monthlyPayment(principal, config.interestRate, termYears);
      amountEl.textContent = formatCurrency(Math.round(payment));
    }

    updatePayment();
    contentRoot.append(heading, grid);
    return contentRoot;
  }

  const contentRoot = buildCalculatorRoot();
  [...block.children].forEach((row) => row.remove());
  block.innerHTML = '';
  block.appendChild(contentRoot);
  block.classList.remove('loan-calculator-block--loading');
}
