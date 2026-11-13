// Load a saved page into the test document. Fixtures are imported as text with Vite's
// `?raw` suffix, e.g. `import page from "../test/fixtures/order.html?raw"`.
// Scripts in the HTML are not run (jsdom's default), but their text stays readable.

/** Replace the current document's contents with `html`; returns the document. */
export function loadPage(html: string): Document {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.documentElement.replaceWith(document.adoptNode(parsed.documentElement));
  return document;
}
