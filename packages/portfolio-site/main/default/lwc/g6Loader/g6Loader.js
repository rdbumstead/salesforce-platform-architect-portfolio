/**
 * @description       : Shared loader for the AntV G6 4.x library (G6_Library static resource).
 *                      Loads the script at most once per page and hands every caller the same G6 global.
 *                      Consumers: skillNetwork (Round 3), schemaVisualizer (Round 5). Nobody else edits it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { loadScript } from "lightning/platformResourceLoader";
import G6_LIBRARY from "@salesforce/resourceUrl/G6_Library";

// One promise per page. Every component that asks for G6 shares it.
let g6Promise;

function reasonOf(error) {
  if (!error) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message || error.type || String(error);
}

/**
 * Loads G6_Library once per page and resolves to the G6 global.
 * A failed load is not cached, so a later call can try again.
 * @param {LightningElement} component the calling component, passed to loadScript
 * @returns {Promise<object>} resolves to the G6 namespace (G6.Graph and friends)
 */
export function loadG6(component) {
  if (!g6Promise) {
    g6Promise = loadScript(component, G6_LIBRARY)
      .catch((error) => {
        throw new Error(`G6_Library failed to load: ${reasonOf(error)}`);
      })
      .then(() => {
        const g6 = window.G6;
        if (!g6 || typeof g6.Graph !== "function") {
          throw new Error(
            "G6_Library loaded but no G6.Graph constructor was found"
          );
        }
        return g6;
      })
      .catch((error) => {
        g6Promise = undefined;
        throw error;
      });
  }
  return g6Promise;
}
