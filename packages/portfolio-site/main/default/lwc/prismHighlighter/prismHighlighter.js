/**
 * @description       : The site's one Prism module. loadPrism loads the
 *                      Prism_JS static resource (prism.js and prism.css) once per page and hands
 *                      every caller the same Prism object, or undefined when the resource fails.
 *                      highlight turns code into HTML built only from escaped text: Prism tokens
 *                      for a known grammar, the clike grammar for an unknown one, and escaped
 *                      plain text when Prism is missing or throws. languageForPath picks the
 *                      grammar for a repository file. Consumers: codeViewer and apiTester.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { loadScript, loadStyle } from "lightning/platformResourceLoader";
import PRISM_JS from "@salesforce/resourceUrl/Prism_JS";

/** Grammar used when Prism has none for the requested language. */
export const FALLBACK_GRAMMAR = "clike";

/** Language name for a file type with no grammar. */
export const LANGUAGE_NONE = "none";

const LANGUAGE_BY_EXTENSION = Object.freeze({
  cls: "apex",
  trigger: "apex",
  js: "javascript",
  html: "markup",
  xml: "markup",
  css: "css",
  yaml: "yaml",
  yml: "yaml",
  json: "json"
});

// One load per page, shared by every caller. A failed load is not kept, so a later call
// can try again. The cache is also dropped when window.Prism is no longer the object the
// load produced, which only happens when a test page removes it.
let prismPromise;
let loadedPrism;

function isUsable(prism) {
  return Boolean(
    prism && prism.languages && typeof prism.highlight === "function"
  );
}

/**
 * Escapes text for use as HTML.
 * @param {string} value raw text
 * @returns {string} the text with &, <, >, " and ' escaped
 */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Loads Prism_JS/prism.css and Prism_JS/prism.js once per page.
 * @param {LightningElement} component the calling component, passed to the resource loader
 * @returns {Promise<object|undefined>} the Prism object, or undefined when the load failed
 */
export function loadPrism(component) {
  if (prismPromise && loadedPrism && window.Prism !== loadedPrism) {
    prismPromise = undefined;
    loadedPrism = undefined;
  }
  if (!prismPromise) {
    // Started inside a then, so a loader that throws instead of rejecting still lands
    // in the catch below.
    prismPromise = Promise.resolve()
      .then(() =>
        Promise.all([
          loadStyle(component, PRISM_JS + "/prism.css"),
          loadScript(component, PRISM_JS + "/prism.js")
        ])
      )
      .then(() => {
        const prism = window.Prism;
        if (!isUsable(prism)) {
          prismPromise = undefined;
          return undefined;
        }
        loadedPrism = prism;
        return prism;
      })
      .catch(() => {
        prismPromise = undefined;
        return undefined;
      });
  }
  return prismPromise;
}

/**
 * Highlights code for innerHTML. Prism encodes the text before it wraps tokens, and every
 * other path escapes it, so the result never carries markup from the code itself.
 * @param {object|undefined} prism the object loadPrism resolved to
 * @param {string} code the source text
 * @param {string} language a Prism language name, for example apex or yaml
 * @returns {string} HTML built only from escaped text
 */
export function highlight(prism, code, language) {
  const text = code === null || code === undefined ? "" : String(code);
  if (!isUsable(prism)) {
    return escapeHtml(text);
  }
  const grammar =
    prism.languages[language] || prism.languages[FALLBACK_GRAMMAR];
  if (!grammar) {
    return escapeHtml(text);
  }
  try {
    return prism.highlight(text, grammar, language);
  } catch {
    return escapeHtml(text);
  }
}

/**
 * The Prism language for a repository path, from its extension.
 * @param {string} path for example packages/.../apiTester.js
 * @returns {string} apex, javascript, markup, css, yaml, json or none
 */
export function languageForPath(path) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(path || ""));
  if (!match) {
    return LANGUAGE_NONE;
  }
  return LANGUAGE_BY_EXTENSION[match[1].toLowerCase()] || LANGUAGE_NONE;
}
