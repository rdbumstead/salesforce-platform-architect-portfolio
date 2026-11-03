/**
 * Whether the visitor is leaving the page, kept apart from mount.js so it can be tested
 * without the LWC engine.
 */
// True once the visitor is leaving the page. A link followed while the later sections are
// still loading cancels their module requests, and WebKit reports each cancelled import as
// an error. Those are expected and dropped. A failure while the visitor stays is reported.
let leaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    leaving = true;
  });
  window.addEventListener("beforeunload", () => {
    leaving = true;
  });
}

/** Test seam: whether the page is being left. */
export function setLeaving(value) {
  leaving = value;
}

/** A failed section load is dropped quietly when the page is being left, and thrown otherwise. */
export function unlessLeaving(error) {
  if (leaving) {
    return null;
  }
  throw error;
}
