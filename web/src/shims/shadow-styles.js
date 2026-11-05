/**
 * Puts one shared stylesheet inside the shadow root of every component.
 *
 * The Salesforce site runs components in synthetic shadow, where the page's SLDS rules reach
 * every element. The static build runs them in native shadow, where a rule on the page stops
 * at the host. So the trimmed SLDS sheet is adopted into each root as the root is created.
 *
 * It wraps Element.prototype.attachShadow, because that is the one place every component
 * passes through, nested ones included, and a root made by any component gets the sheet
 * without the component knowing. The engine keeps its own copy of attachShadow from when it
 * loads, so this must run first. The entry module imports shadow-styles-boot.js before
 * anything else for that reason.
 *
 * The sheet goes in first, ahead of the engine's own pushes, so a component's own css wins
 * wherever it and the sheet set the same property at the same weight.
 */

/**
 * Roots made for portfolio components, base component stand ins and components the engine
 * creates from a dynamic constructor (their tag starts with lwc-) only.
 */
export function isComponentHost(element) {
  const name = String((element && element.localName) || "");
  return (
    name.startsWith("c-") ||
    name.startsWith("lightning-") ||
    name.startsWith("lwc-")
  );
}

/**
 * @param {object} prototype Element.prototype, or a stand in under test
 * @param {string} css the sheet text
 * @param {Function} SheetClass CSSStyleSheet, or a stand in under test
 * @returns {boolean} true when attachShadow was wrapped
 */
export function installShadowStyles(
  prototype,
  css,
  SheetClass = globalThis.CSSStyleSheet
) {
  if (!prototype || prototype.__shadowStylesInstalled) return false;
  if (
    typeof SheetClass !== "function" ||
    typeof SheetClass.prototype.replaceSync !== "function"
  ) {
    return false;
  }
  const sheet = new SheetClass();
  sheet.replaceSync(css);
  const attachShadow = prototype.attachShadow;
  prototype.attachShadow = function attachShadowWithSheet(init) {
    const root = attachShadow.call(this, init);
    if (isComponentHost(this)) {
      try {
        root.adoptedStyleSheets = [sheet, ...root.adoptedStyleSheets];
      } catch {
        // A root that refuses adopted sheets keeps only the component's own styles.
      }
    }
    return root;
  };
  Object.defineProperty(prototype, "__shadowStylesInstalled", { value: true });
  return true;
}
