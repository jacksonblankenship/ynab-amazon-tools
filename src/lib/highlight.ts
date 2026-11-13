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

type Edges = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

/**
 * Where to scroll `box`'s top to, in viewport pixels, so `cover` (a panel pinned over the
 * page) doesn't hide it. A panel over only part of its width leaves it readable; one across
 * it sends the box to the larger free band above or below the panel.
 */
export function clearTop(box: Edges, cover: Edges | null, viewH: number, gap = 16): number {
  if (!cover) return gap;
  const overlap = Math.min(box.right, cover.right) - Math.max(box.left, cover.left);
  if (overlap * 2 <= box.right - box.left) return gap;
  return cover.top >= viewH - cover.bottom ? gap : cover.bottom + gap;
}
