// An outline drawn over the retailer's own elements, floating above the page rather than
// styled into it: the page's markup and CSS are left alone, so a restyle can't hide it or
// be broken by it. It follows the elements as the page moves around them.

export interface Highlight {
  remove: () => void;
}

export function highlight(prefix: string, targets: Element[]): Highlight {
  const rings = targets.map(() => {
    const r = document.createElement("div");
    r.className = `${prefix}-ring`;
    r.setAttribute("aria-hidden", "true");
    document.body.appendChild(r);
    return r;
  });
  const place = () =>
    targets.forEach((t, i) => {
      const ring = rings[i];
      if (!ring) return;
      const b = t.getBoundingClientRect();
      // Gone from the page, or hidden: nothing to point at.
      ring.hidden = !t.isConnected || (!b.width && !b.height);
      Object.assign(ring.style, {
        top: `${b.top + scrollY}px`,
        left: `${b.left + scrollX}px`,
        width: `${b.width}px`,
        height: `${b.height}px`,
      });
    });
  place();
  // Images and late content above the element move it without any event of its own.
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
  ro?.observe(document.body);
  for (const t of targets) ro?.observe(t);
  addEventListener("resize", place);
  return {
    remove() {
      ro?.disconnect();
      removeEventListener("resize", place);
      for (const r of rings) r.remove();
    },
  };
}
