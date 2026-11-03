/**
 * Stand in for @salesforce/client/formFactor, read once from the viewport width the way
 * the platform reads it when the page loads: Small under 768 px, Medium under 1024 px.
 */
function formFactor() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return "Large";
  if (window.matchMedia("(max-width: 767px)").matches) return "Small";
  if (window.matchMedia("(max-width: 1023px)").matches) return "Medium";
  return "Large";
}

export default formFactor();
