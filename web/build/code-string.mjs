/**
 * A value written into generated JavaScript as a literal. JSON gives a valid literal, and the
 * characters that could close a script element or break a line are escaped as well, the
 * pattern code scanning expects for code built from data.
 */
const CHAR_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

function escapeUnsafeChars(text) {
  return text.replace(/[<>\b\f\n\r\t\0\u2028\u2029]/g, (character) => CHAR_MAP[character]);
}

/** JSON for a value, safe to place inside generated code. */
export function codeString(value) {
  return escapeUnsafeChars(JSON.stringify(value));
}
