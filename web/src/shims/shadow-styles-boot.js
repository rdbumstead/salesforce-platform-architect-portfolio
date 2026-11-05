/**
 * Installs the shared shadow root sheet. It has no imports of the engine, so when an entry
 * module lists it first it runs before the engine does. See shadow-styles.js.
 */
import css from "site:adopted-styles";
import { installShadowStyles } from "./shadow-styles.js";

if (typeof Element !== "undefined") {
  installShadowStyles(Element.prototype, css);
}
