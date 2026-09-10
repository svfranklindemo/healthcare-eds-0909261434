/**
 * Column Separator is a structural marker block only.
 * Placing it between other blocks in a section splits the section into
 * columns (grouping) in scripts/aem.js's decorateSections(), which then
 * sizes the resulting columns using the section's "Column Layout" field.
 * This block renders nothing on the live page (hidden via column-separator.css)
 * and only stays visible inside the Universal Editor so it can be selected/moved.
 * @param {Element} block
 */
export default function decorate(block) {
  block.setAttribute('aria-hidden', 'true');
}
