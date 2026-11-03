/**
 * Stand in for lightning/platformResourceLoader. Each URL is added to the document head
 * once, and every caller gets the same promise, as on the platform.
 */
const loaded = new Map();

function add(url, make) {
  if (!loaded.has(url)) {
    loaded.set(
      url,
      new Promise((resolve, reject) => {
        const node = make();
        node.addEventListener("load", () => resolve());
        node.addEventListener("error", () => {
          loaded.delete(url);
          reject(new Error(`Could not load ${url}`));
        });
        document.head.appendChild(node);
      })
    );
  }
  return loaded.get(url);
}

export function loadScript(component, url) {
  return add(url, () => {
    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    return script;
  });
}

export function loadStyle(component, url) {
  return add(url, () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    return link;
  });
}
