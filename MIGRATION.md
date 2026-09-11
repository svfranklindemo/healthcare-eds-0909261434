# Migration notes: this codebase → new DA-authored boilerplate

Context: this project is an Adobe-to-VA capability demo built on a heavily-customized
fork of `aem-boilerplate` with Universal Editor (xwalk) authoring. The new project
starts from a clean `aem-boilerplate` and authors content in Document Authoring (DA)
instead — no per-block dialogs, no `models/`, no `component-*.json`. This file lists
everything from this codebase that carries real value and should be ported
deliberately, what's xwalk-specific and should be left behind, and known bugs found
along the way that shouldn't be copied as-is.

## 1. Adobe Experience Platform Web SDK integration (the main one)

This was built from scratch during this engagement, replacing a legacy `at.js` Target
integration. It's pure JS/CSS — nothing xwalk-specific — so it should port directly.

**Files:**
- `scripts/alloy.js` — Adobe's official self-hosted Web SDK build (v2.35.1, minified,
  159KB, from `https://cdn1.adoberesources.net/alloy/2.35.1/alloy.min.js`). Carries a
  **local patch** at the very end of the file (search for `LOCAL PATCH` in the header
  comment) — do not silently overwrite this file on a future Adobe version bump
  without reapplying the patch, or re-verifying it's no longer needed.
- `scripts/scripts.js` — all the loading/orchestration logic (see below), living just
  above `loadEager`.

**Config values in use (same Adobe org as the rest of this demo — see §9):**
```js
datastreamId: '52111c1f-3550-417e-a968-2f17fb6ab876'
orgId: '0E061E2D61F93F260A495FD6@AdobeOrg'
```

**Functions to port (all in `scripts/scripts.js`, currently lines ~365–513):**
- `initWebSDK(path, config)` — sets up the `window.webSdk` stub/queue, dynamically
  `import()`s `alloy.js`, calls `configure`, and **always resolves** even on failure
  (via `.catch`) so a Web SDK problem can never hang `loadEager` forever. This
  fail-safe behavior is important — the very first version of this code didn't have
  it and a load failure silently froze the entire page (nothing past `loadEager` ever
  ran).
- `toCssSelector(selector)` / `getElementForProposition(proposition)` — resolve a
  proposition's target DOM element, preferring `prehidingSelector` over the raw
  Target `:eq()`-style selector.
- `onDecoratedElement(fn)` — a `MutationObserver`-based hook that calls `fn`
  immediately if blocks/sections are already decorated, and again every time more of
  them finish (or on any other body mutation, including ones from unrelated browser
  extensions — it's a coarse hook, not scoped to just EDS's own lifecycle).
- `getAndApplyRenderDecisions()` — calls `sendEvent`, then applies + reports
  propositions via `onDecoratedElement`.
- Top-level kickoff: `const alloyLoadedPromise = initWebSDK(...)` +
  `alloyLoadedPromise.then(() => getAndApplyRenderDecisions().catch(...))`, and inside
  `loadEager`: `await alloyLoadedPromise;` right after `decorateTemplateAndTheme()`.

**Non-obvious things that took real trial-and-error to get right — don't skip these:**

1. **Instance naming collision.** If Adobe Launch is *also* loaded on the page with
   its own Web SDK ("adobe-alloy") extension, and you name your own instance
   `alloy`, both bootstraps fight over the same `window.__alloyNS` coordination
   array and `window.alloy`, throwing `Cannot set properties of undefined (setting
   'push')` — intermittently, depending on which script happens to finish loading
   first. Renaming the instance (this code uses `webSdk`) does **not** fully fix
   it, because the vendor bootstrap code iterates *every* name in
   `window.__alloyNS`, not just the one it owns — whichever `alloy.js` copy runs
   *second* still tries to reprocess names the first one already converted from
   "stub with `.q`" to "real function" (no `.q`), and crashes on `window[n].q.push`.
   The real fix applied here is the local patch in `scripts/alloy.js`:
   `o=window[n]&&window[n].q;if(o){o.push=r,o.forEach(r)}`. **In the new codebase,
   decide definitively: either Launch owns Web SDK, or this direct-load code does —
   don't run both.** That sidesteps the whole class of bug.
2. **A load/configure failure must never be allowed to hang page load.** `import()`
   rejecting (e.g. from the collision above) with no `.catch()` left
   `initWebSDK`'s wrapping promise permanently unsettled, and `await
   alloyLoadedPromise` in `loadEager` blocked forever — the rest of the page (all
   block decoration) never ran. Always resolve, never let it hang.
3. **`sendEvent` needs a specific XDM shape to get real Target decisions**, not just
   the page-wide default. Reverse-engineered from Launch's own "XDM - Page View"
   data element (found by downloading and grepping the actual Launch bundle):
   ```js
   {
     type: 'web.webpagedetails.pageViews', // top-level, not nested in xdm
     renderDecisions: false,
     xdm: {
       web: {
         webInteraction: { URL: window.location.href, name: document.title },
         webPageDetails: {
           name: document.title,
           viewName: window.dataLayer?.page?.name, // <- the important one
         },
       },
     },
   }
   ```
   **`webPageDetails.viewName` (not `.name`) is what Target's server-side
   decisioning uses to resolve a named view** (e.g. `"home"` for the homepage, a
   value that comes from `window.dataLayer.page.name` — see §2). Without it, only
   the generic page-wide `__view__` scope gets evaluated, and URL/view-scoped
   Target activities silently never fire — this looks exactly like "Target isn't
   working" but is actually a missing field. Also note `URL` lives under
   `webInteraction`, not `webPageDetails`.
4. **`applyPropositions` rejects any proposition with an empty `items` array.**
   The natural pattern (from Adobe's own `aem.live` Target integration guide) is to
   prune `items` down over repeated `onDecoratedElement` calls once a target
   element is found, so the same dom-action isn't reapplied forever — but if you
   only empty `.items` and never drop the whole proposition object, the *next*
   `applyPropositions` call throws `'propositions[1].items': Expected a non-empty
   array, but got []`. Filter to `propositions.filter(p => p.items.length > 0)`
   before every call, and skip the call entirely if nothing's left.
5. **`getElementForProposition` is `async`** (the aem.live doc's own sample code
   has this bug) but its result was being used directly inside a synchronous
   `.filter()` without `await` — since a Promise is always truthy, the
   "already-applied, stop reprocessing" check silently never worked, causing
   `applyPropositions` to fire ~20+ redundant times per page load (once per block
   that finishes decorating). Must `await` it properly inside an async map/filter.

**Also review, but not built here — do before going live with a new org:**
the org ID, datastream ID, and Target activity all belong to Adobe's shared
internal demo environment (see §9) — these must be swapped for the real customer's
values in a production migration.

## 2. Data layer (`scripts/datalayer.js`)

Builds and maintains `window.dataLayer`, a local pub/sub-style state store backed by
`localStorage` (30-day TTL). Not Adobe-specific — it's this project's own custom
convention — but **`window.dataLayer.page.name` is a hard dependency of the Web SDK
integration above** (feeds `viewName`), so however the new codebase manages page
context, something needs to expose an equivalent "page name" value (e.g. `"home"` for
the homepage) for Target's view-based decisioning to keep working.

Key pieces to port or reimplement:
- Seeded at init from a JSON string in `placeholders.json`'s `datalayer` key (see
  §7) — this project's seed is
  `{"projectName":"we-healthcare","project":{...},"page":{"name":"home","title":"..."},"cart":{}}`.
- `getPageNameFromPathname(pathname)` — derives a page name from the URL path,
  falling back to `'home'` for the root path or locale-only segments. Currently only
  used as a *fallback* in `buildCustomDataLayer()`; the actual value in practice
  tends to be overridden by the lowercased page `<title>`, so double-check which
  behavior you actually want in the new project (title-derived vs. path-derived
  page names produced different results here, and this ambiguity is exactly what
  caused several rounds of Target debugging above).
- Public API other blocks/scripts call into: `window.updateDataLayer(updates,
  merge)`, `window.addToCart(productData)`, `window.resetDataLayerToInitial(options)`,
  `window.getDataLayerProperty(path)`, `window.clearDataLayer()`,
  `window.getDataLayerQueueStatus()`, plus normalizer helpers
  (`getDataLayerYesNo`, `getDataLayerFlightClass`, `getDataLayerFlightLength`,
  `getDataLayerDate`) used when blocks push form data into the layer.
- Fires a `dataLayerUpdated` DOM event on every change — `blocks/header/header.js`'s
  cart badge listens for this, as an example of the pattern.

## 3. Launch-readiness event bridge (`scripts/custom-events.js`)

Bridges `dataLayer.js` state to Adobe Launch via DOM `CustomEvent`s, with queuing
(via `sessionStorage`) until Launch signals ready. Fires a `page-view` event once the
data layer is stable, and exposes `dispatchCustomEvent(eventName, options)` for other
blocks (registration, sign-in, join-us, flight-search in this codebase) to fire their
own named events for Launch rules to react to.

**Only port this if the new codebase keeps Adobe Launch for anything** (Analytics,
other tag-managed extensions). If the new codebase goes fully direct-Web-SDK with no
Launch at all, this entire queuing mechanism becomes dead weight — the `page-view`
event will queue forever and never flush (harmless, but pure overhead: it runs a
10-second, 200-iteration polling loop every page load waiting for a Launch that will
never arrive). Simplify or remove in that case.

## 4. Adobe Launch loading pattern (`head.html`)

The current `head.html` fetches `/placeholders.json`, reads a `launch` key, and
appends that URL as an async `<script>`, dispatching `window._launchReady = true` +
a `launchReady` event on load. **This is currently commented out** in this codebase
(disabled to isolate-test the direct Web SDK integration above) — decide
deliberately in the new project whether Launch is still wanted at all, given the Web
SDK work in §1 already covers Target directly and more cheaply (159KB self-hosted vs.
a 2.2MB Launch "development" bundle that was the original cause of the reported
performance complaint that started this whole workstream).

## 5. Consent handling

`scripts/scripts.js` has a small `getStoredConsentDecision`/`storeConsentDecision`
pair (session-storage key `consentModalDecision`) feeding a consent modal elsewhere
in the codebase. Web SDK's own log output references "Loaded user consent
preferences. The user previously consented." — worth confirming how (or whether) the
new project's consent UI needs to feed Web SDK's consent API
(`alloy('setConsent', ...)`) if consent gating is a real requirement, since this
codebase's consent modal wasn't verified to actually wire into Web SDK during this
engagement (it just happened to already show an "approved" state during testing).

## 6. VA/USWDS visual theme (`styles/industry-specific/va-theme/va-theme.css`)

This is the actual VA-facing deliverable of the demo — a from-scratch USWDS-inspired
restyle, organized in 7 sections (still accurate as of writing):
1. Brand tokens (VA color palette, Bitter/Source Sans Pro via Google Fonts)
2. Links, buttons, focus states (USWDS-style gold focus ring)
3. "Official government site" utility banner (see §6a)
4. Header (logo / main nav / utility nav, two-row layout)
5. Hero (dark navy gradient variant, link-style CTA with icon badge)
6. Cards → benefit-category icon grid (icon-left, borderless, color-cycled badges)
7. Footer

This whole file is scoped under `.va-theme`/`body.va-theme` selectors, following
this codebase's existing multi-brand theming convention (11 industry themes live
side-by-side, switched via a body class). **If the new codebase is VA-only (no
multi-brand switching needed), strip the `.va-theme`/`body.va-theme` prefixes** and
fold these rules into the base stylesheet directly — there's no reason to keep the
brand-switching indirection (the `--brand-*` CSS custom property fallback pattern
in the base `styles.css`) if there's only ever going to be one brand.

### 6a. Gov banner + header structural changes (`blocks/header/header.js`)
- `buildGovBanner()` — theme-gated (`document.body.classList.contains('va-theme')`),
  injects the official-website banner + "Here's how you know" details/summary +
  Crisis Line link, prepended to the header block. Uses `/icons/flag-USD.svg`
  (repurposed, pre-existing asset) and
  `/styles/industry-specific/va-theme/icons/{tiny-usa-flag.png,VCL-icon-white.svg}`
  (added during this engagement).
- **Real bug fixed, worth carrying the fix forward regardless of theme:** the
  sign-in button logic only checked for an existing `.sign-in-btn` *class* before
  injecting a new one — but an authored content link (e.g. `href="#sign-in"`) never
  has that class, so it always failed and created a **duplicate** sign-in button.
  Fixed by also matching `a[href*="sign-in"]` and styling that existing link instead
  of duplicating it (see `existingSignIn` in `header.js`, ~line 749). This is a
  generic bug, not VA-specific — port the fix regardless of whether the VA theme CSS
  itself comes along.
- Utility nav ordering (search → contact us → sign in → language picker) achieved
  via CSS `order` on flex children, not JS — ports with the CSS in §6.

## 7. Section-level layout customizations (`scripts/aem.js`)

Two related but separable pieces of section-decoration logic were added/fixed here,
**both tied to xwalk's `section-metadata` block + dataset-attribute pattern**
(`data-sec-item-widths`, etc.) — verify DA's section/metadata authoring model
supports an equivalent mechanism before porting as-is; the concept is worth keeping,
but the plumbing may need to change:

- **`applySectionItemWidths(section)`** (pre-existing, not built during this
  engagement, but touched/hardened here) — reads a `sec-item-widths` value (a
  select field in `models/_section.json`, presented to authors as friendly presets
  like "50 / 50", "25 / 75", etc. — see below) and applies `flex-basis`/`max-width`
  percentages to the section's direct-child "items."
- **`isColumnSeparatorWrapper(el)` / `applyColumnSeparators(section)`** (new, this
  engagement) — a `column-separator` marker block (see `blocks/column-separator/`)
  that an author places between content blocks in a section; decoration groups
  consecutive non-separator siblings into new wrapper divs at each separator
  boundary, so authors can put *multiple* blocks in one logical column instead of
  being limited to one block per column. The separator block itself is hidden on
  the live page via CSS (`:has()` selector) but stays visible/selectable in
  Universal Editor.
- The "Column Layout" authoring field itself (`models/_section.json`, options
  50/50, 40/60, 60/40, 30/70, 70/30, 25/75, 75/25, 33/33/33, 25/25/25/25 → each
  mapping to a comma-separated percentage string) is xwalk dialog config and won't
  port directly, but **the preset list is worth reproducing in whatever field DA
  ends up using for the same purpose.**

## 8. Known bugs found in this codebase — do not blindly copy

- **`models/_component-models.json` and `models/_component-definition.json` had
  13 and 39 stale duplicate inline definitions respectively** (leftover copies for
  blocks that were later given their own dedicated `blocks/<name>/_<name>.json`
  file, never cleaned up) — caused duplicate-key issues in the generated
  `component-*.json` that broke the Universal Editor block picker (missing ~60
  blocks) and likely caused a crash when searching the picker (React duplicate-key
  behavior). **N/A for a DA-based project** (no `models/` or `component-*.json` at
  all), but worth knowing about if anyone ever asks "why doesn't the picker show
  block X" on *this* codebase.
- **6 blocks were missing a required `"filters": []` key** in their own
  `_<name>.json` files, silently crashing the `merge-json-cli`-based
  `npm run build:json:filters` step for a long time — meaning the committed
  `component-*.json` files had been stale for a while before this was caught.
  Also N/A for DA.
- **`blocks/default-content-wrapper/default-content-wrapper.{css,js}` 404s** appear
  in the console on every page load (`aem.js` tries to load a block by that name
  and fails). This predates all the Target/theme work in this document and was
  never root-caused — worth investigating fresh in the new codebase rather than
  assuming it'll disappear on its own.
- **Legacy `at.js` Target integration** (`scripts/delayed.js`'s `loadAT()`,
  `scripts/at-lsig.js`) — superseded by §1, should not be ported. Currently
  commented out, not deleted, in this codebase.

## 9. Adobe org/credentials context — do not treat as reusable

Every Adobe ID in this codebase (Analytics report suite, Target `at_property`
`549d426b-0bcc-be60-ce27-b9923bfcad4f`, Web SDK org `0E061E2D61F93F260A495FD6@AdobeOrg`
/ datastream `52111c1f-3550-417e-a968-2f17fb6ab876`, the hardcoded Analytics beacons
in `blocks/footer/footer.js` pointing at `mcorgid=60306A9C56F40F607F000101%40AdobeOrg`)
belongs to **Adobe's shared internal "Live Demo System"** — standard for this
multi-industry demo framework, not a VA-specific or customer-specific integration.
Fine to reuse as-is for another demo; must be replaced with real customer credentials
before any production/pilot use.

## 10. `placeholders.json` keys this code depends on

| Key | Purpose | Needed by |
|---|---|---|
| `launch` | Adobe Launch script URL | `head.html` (only if keeping Launch, §4) |
| `datalayer` | JSON string, seeds `window.dataLayer` | `scripts/datalayer.js` (§2) |
| `hostname` | Author instance hostname | various `getHostname()` calls |
| `site-name` | Content path root | nav/fragment path resolution |
| `languages` | Comma-separated locale list | language switcher |

## 11. Content source (fstab.yaml)

This project's `fstab.yaml` mounts an xwalk/Universal-Editor AEM Author instance
(`type: markup`, a `franklin.delivery` URL). DA-based projects use a different
source (a `da.live` document/sharepoint-style URL) — not a like-for-like copy, check
DA's own project setup docs for the correct `fstab.yaml` shape rather than adapting
this one.

## Quick checklist for the new project

- [ ] Port `scripts/alloy.js` (with its local patch) and the Web SDK orchestration
      code in `scripts/scripts.js` (§1) — decide Launch-or-direct-Web-SDK, not both
- [ ] Decide what replaces `window.dataLayer.page.name` for Target `viewName`
      resolution (§2)
- [ ] Decide whether Launch survives in the new project at all (§3, §4) — if not,
      drop/simplify the custom-events queueing
- [ ] Port the sign-in-button duplicate-detection fix in `header.js` regardless of
      whether the VA theme comes along (§6a)
- [ ] Port `va-theme.css`, stripped of brand-switching indirection if VA is the only
      brand (§6)
- [ ] Re-derive the column-separator / section-width authoring pattern against DA's
      actual section/metadata model rather than assuming `data-sec-*` carries over
      (§7)
- [ ] Get real customer Adobe credentials before any non-demo use (§9)
- [ ] Investigate the `default-content-wrapper` 404 fresh in the new codebase (§8)
