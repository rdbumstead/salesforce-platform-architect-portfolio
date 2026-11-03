/**
 * Values written into generated JavaScript. A string becomes a double quoted literal with
 * every backslash, quote and line break escaped, and the characters that could close a
 * script element escaped as well. Any other value becomes JSON.parse of such a literal, so
 * the generated code holds data only as fully escaped string literals.
 */
const CHAR_MAP = {
  '\\': '\\\\',
  '"': '\\"',
  '<': '\\u003C',
  '>': '\\u003E',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\u0000',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

/** A double quoted JavaScript string literal for text, with every unsafe character escaped. */
export function stringLiteral(text) {
  return '"' + String(text).replace(/[\\"<>\b\f\n\r\t\0\u2028\u2029]/g, (character) => CHAR_MAP[character]) + '"';
}

/** A value as safe JavaScript source: a string literal, or JSON.parse of one. */
export function codeString(value) {
  return typeof value === 'string' ? stringLiteral(value) : `JSON.parse(${stringLiteral(JSON.stringify(value))})`;
}
