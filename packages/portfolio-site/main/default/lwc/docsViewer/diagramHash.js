/**
 * @description       : The name of a diagram's drawing. A Mermaid block is drawn ahead of time
 *                      into two SVG files, one per theme, named by a hash of the block's source
 *                      text. This function is the one definition of that hash: c/docsViewer
 *                      uses it to find the drawing for a block, and scripts/render-mermaid.js
 *                      loads this same file to name the files it writes, so an edited diagram
 *                      never finds an old drawing. Line endings are made plain and trailing
 *                      white space is dropped first, so the hash does not move with the file's
 *                      line endings.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/

/**
 * A 53 bit string hash (cyrb53), as 14 hex digits.
 * @param {string} source the text of a Mermaid block
 * @returns {string} for example "1f2e3d4c5b6a79"
 */
export function diagramHash(source) {
  const text = String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+$/, "");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}
