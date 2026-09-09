import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { readBlockConfig } from "../../scripts/aem.js";

/**
 * Get purchase order number from URL query param.
 * Falls back to generating a new one if not found.
 * @returns {string} Purchase order number
 */
function getPurchaseOrderNumber() {
  const orderFromUrl = new URLSearchParams(window.location.search).get("order");
  if (orderFromUrl) {
    return orderFromUrl;
  }

  // Fallback: generate new order number if not found
  const prefix = "fb";
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `${prefix}${timestamp}${random}`.substring(0, 12);
}

/**
 * Reset cart and commerce data in dataLayer
 * Note: Does NOT clear checkout form data (personal/address info)
 * User's personal information is preserved for future orders
 */
function resetCart() {
  const defaultCart = {
    productCount: 0,
    products: {},
    subTotal: 0,
    total: 0,
  };

  if (window.updateDataLayer) {
    // Clear both cart and commerce objects
    window.updateDataLayer({ 
      cart: defaultCart, 
      product: {},
      commerce: {} 
    }, false);
    console.log("Cart and commerce data reset in dataLayer");
  }
  
}

/**
 * Schedule cart reset:
 * 1) on page abandon (pagehide/beforeunload), or
 * 2) after a fallback delay if user stays on the page.
 */
function scheduleCartReset(delayMs = 5000) {
  let hasReset = false;

  const runResetOnce = () => {
    if (hasReset) return;
    hasReset = true;
    resetCart();
  };

  const timer = window.setTimeout(runResetOnce, delayMs);

  const handlePageAbandon = () => {
    window.clearTimeout(timer);
    runResetOnce();
  };

  window.addEventListener("pagehide", handlePageAbandon, { once: true });
  window.addEventListener("beforeunload", handlePageAbandon, { once: true });
}

/**
 * Build order confirmation content
 * @param {string} orderNumber - Generated order number
 * @returns {HTMLElement} Confirmation content
 */
function buildConfirmationContent(orderNumber) {
  const content = document.createElement("div");
  content.className = "order-confirmation-content";

  const message = document.createElement("div");
  message.className = "order-confirmation-message";

  const thankYou = document.createElement("h1");
  thankYou.className = "order-confirmation-title";
  thankYou.textContent = "THANK YOU!";

  const subtitle = document.createElement("p");
  subtitle.className = "order-confirmation-subtitle";
  subtitle.textContent = "WE RECEIVED YOUR ORDER";

  const orderInfo = document.createElement("p");
  orderInfo.className = "order-confirmation-number";
  orderInfo.innerHTML = `Order No. <strong>${orderNumber}</strong>`;

  message.append(thankYou, subtitle, orderInfo);
  content.append(message);

  return content;
}

/**
 * Decorate the order confirmation block
 * @param {HTMLElement} block - The block element
 */
export default function decorate(block) {
  const config = readBlockConfig(block) || {};
  
  block.textContent = "";

  // Get purchase order number from URL (set by order-summary)
  const orderNumber = getPurchaseOrderNumber();

  const container = document.createElement("div");
  container.className = "order-confirmation-container";

  const content = buildConfirmationContent(orderNumber);

  // Fire purchase order event on page load before cart reset.
  const purchaseOrderEventType = config["purchase-order-event-type"]?.trim();
  if (purchaseOrderEventType) dispatchCustomEvent(purchaseOrderEventType);

  // Reset cart data on page abandon, or after 5s as a fallback.
  // This gives purchase tracking enough time to read full cart payload.
  scheduleCartReset(5000);
  
  container.appendChild(content);
  block.appendChild(container);
}