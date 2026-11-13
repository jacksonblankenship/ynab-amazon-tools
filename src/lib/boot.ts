// Startup helpers for scripts that run at document-start.

/** Run `fn` once the DOM is parsed (now, if it already is). */
export const ready = (fn: () => void) =>
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn, { once: true })
    : fn();

/** Wrap `fn` so anything it throws, sync or async, goes to `fail`. */
export const guard =
  (fail: (e: unknown) => void, fn: () => void | Promise<void>) => () => {
    try {
      const r = fn();
      if (r) r.catch(fail);
    } catch (e) {
      fail(e);
    }
  };
