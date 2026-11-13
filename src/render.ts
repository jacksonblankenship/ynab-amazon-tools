// Order page UI: the per-delivery banners, the order-level panel, and the single-charge view.
import { $, $$, el, esc } from "./lib/dom.ts";
import { must } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { disclosure } from "./lib/suite.ts";
import { splitGroup } from "./matcher.ts";
import { suite } from "./overlay.ts";
import type {
  Focus,
  Order,
  RenderResult,
  Solution,
  Split,
  Txn,
} from "./types.ts";

export const short = (t: string) =>
  t.length > 70 ? `${t.slice(0, 70).replace(/\s+\S*$/, "")}…` : t;
const chargeLabel = (c: Txn) =>
  `${fmt(c.amount)} on ${c.date || "unknown date"}${c.status && !/completed|charged|refunded/i.test(c.status) ? ` (${esc(c.status)})` : ""}`;

function splitTable(split: Split, multi: boolean) {
  const box = el("div", "acs-split");
  const head = el(
    "div",
    null,
    `${multi ? `<b>${fmt(split.charge.amount)}</b> charge` : "Items"}` +
      `${split.exact ? "" : ' <span class="acs-muted">(Amazon didn\'t say which items, so each item gets its share of this charge)</span>'}`,
  );
  box.appendChild(head);
  const rows = split.lines
    .map(
      (l) =>
        `<tr><td>${esc(short(l.item.title))}${l.item.qty > 1 ? ` <span class="acs-muted">×${l.item.qty}</span>` : ""}</td><td class="acs-r">${fmt(l.amount)}</td></tr>`,
    )
    .join("");
  box.appendChild(
    el(
      "table",
      null,
      `${rows}<tr class="acs-tot"><td>Total</td><td class="acs-r">${fmt(split.charge.amount)}</td></tr>`,
    ),
  );
  return box;
}

export function render(order: Order, result: RenderResult) {
  const anchor = $('[data-component="shipments"]');
  const anchorParent = anchor?.parentNode;
  if (!anchor || !anchorParent)
    throw new Error(
      "Couldn't find where to show the results. Amazon may have changed this page.",
    );
  $$(".acs-panel,.acs-banner,.acs-result").forEach((e) => {
    e.remove();
  });
  const { shipments } = order;
  const { charges, credits, refunds, solution, warnings, error } = result;
  const dn = (i: number) => `Delivery ${i + 1}`;

  // Per-shipment banners
  const groupOfShipment = new Map<number, number>();
  if (solution)
    solution.groups.forEach((g, gi) => {
      g.members.forEach((i) => {
        groupOfShipment.set(i, gi);
      });
    });

  shipments.forEach((sh, i) => {
    const b = el("div", "acs-banner");
    const gi = groupOfShipment.get(i);
    const groupCharges =
      solution && gi != null
        ? charges.filter((_, j) => solution.assign[j] === gi)
        : [];
    const est = `<span class="acs-muted">Estimated ${fmt(sh.total)} incl. tax</span>`;

    if (!solution || gi == null || !groupCharges.length) {
      b.appendChild(el("div", "acs-h", `${dn(i)}: no card charge matched`));
      b.appendChild(
        el(
          "div",
          null,
          `${est}. ${charges.length ? "Not charged yet, or paid with points or a gift card." : ""}`,
        ),
      );
      const fake = { amount: sh.total, date: "" };
      for (const split of splitGroup(sh.items, [fake], 0))
        b.appendChild(splitTable(split, false));
    } else {
      const g = must(solution.groups[gi], `group ${gi}`);
      const others = g.members.filter((x) => x !== i);
      const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
      const [onlyCharge] = groupCharges;
      const head =
        onlyCharge && groupCharges.length === 1
          ? `${dn(i)}: charged <span class="acs-amt">${fmt(onlyCharge.amount)}</span>`
          : `${dn(i)}: charged in ${groupCharges.length} parts, <span class="acs-amt">${groupCharges.map((c) => fmt(c.amount)).join(" + ")}</span>`;
      b.appendChild(el("div", "acs-h", head));
      b.appendChild(
        el(
          "div",
          "acs-muted",
          groupCharges
            .map((c) => `${chargeLabel(c)} · ${esc(c.method)}`)
            .join("<br>"),
        ),
      );
      if (others.length) {
        b.appendChild(
          el(
            "div",
            "acs-warn",
            `Billed together with ${others.map(dn).join(" and ")}. The split below covers all of them.`,
          ),
        );
      }
      if (absorbed > 0) {
        b.appendChild(
          el(
            "div",
            "acs-muted",
            `${fmt(absorbed)} of this was paid with points or a gift card, so the card charge is lower than the items' price.`,
          ),
        );
      }
      if (others.length && i !== Math.min(...g.members)) {
        b.appendChild(
          el(
            "div",
            "acs-muted",
            `See ${dn(Math.min(...g.members))} for the split.`,
          ),
        );
      } else {
        const items = g.members.flatMap(
          (x) => must(shipments[x], `delivery ${x + 1}`).items,
        );
        const splits = splitGroup(items, groupCharges, absorbed);
        splits.forEach((s) => {
          b.appendChild(splitTable(s, groupCharges.length > 1));
        });
      }
    }
    sh.box.insertBefore(b, sh.box.firstChild);
  });

  // Order-level panel
  const p = el("div", "acs-panel");
  p.appendChild(el("div", "acs-h", "Charges on this order"));
  if (error)
    p.appendChild(
      el(
        "div",
        "acs-warn",
        `Couldn't load the transactions page (${esc(error)}). Showing estimates only.`,
      ),
    );
  if (charges.length) {
    const lis = charges.map((c, j) => {
      const g = solution?.assign[j] ?? -1;
      const to =
        g >= 0
          ? must(solution?.groups[g], `group ${g}`).members.map(dn).join(" + ")
          : "<b>unmatched</b>";
      return `<li><b>${fmt(c.amount)}</b> · ${esc(c.date)} · ${esc(c.method)} → ${to}</li>`;
    });
    p.appendChild(el("ul", "acs-list", lis.join("")));
  } else if (!error) {
    p.appendChild(
      el(
        "div",
        null,
        "No card charges found for this order yet. Amazon charges when each delivery ships.",
      ),
    );
  }
  if (credits.length)
    p.appendChild(
      el(
        "div",
        "acs-muted",
        `Also paid with: ${credits.map((c) => `${esc(c.method)} ${fmt(c.amount)}`).join(", ")}`,
      ),
    );
  if (refunds.length)
    p.appendChild(
      el(
        "div",
        "acs-muted",
        `Refunds: ${refunds.map((c) => `${fmt(c.amount)} on ${esc(c.date)} to ${esc(c.method)}`).join(", ")}`,
      ),
    );
  if (solution?.ambiguous)
    warnings.push(
      "More than one way to match these charges fits the totals. Double-check the deliveries with similar amounts.",
    );
  warnings.forEach((w) => {
    p.appendChild(el("div", "acs-warn", esc(w)));
  });
  if (order.orderId) {
    p.appendChild(
      el(
        "div",
        "acs-muted",
        `<a href="/cpe/yourpayments/transactions?transactionTag=${encodeURIComponent(order.orderId)}">View transactions for this order</a>`,
      ),
    );
  }
  p.appendChild(el("div", "acs-foot", disclosure(suite)));
  anchorParent.insertBefore(p, anchor);
}

/**
 * Show only the items behind one charge, on the delivery it paid for. Returns the panel
 * and the deliveries it covers, or null if it can't.
 */
export function renderFocus(
  order: Order,
  charges: Txn[],
  solution: Solution,
  focus: Focus,
  warnings: string[] = [],
): { panel: HTMLElement; boxes: Element[] } | null {
  const matched = charges.flatMap((c, j) => {
    const gi = solution.assign[j];
    return gi !== undefined && gi >= 0 && c.amount === focus.amount
      ? [{ c, gi }]
      : [];
  });
  const hit = matched.find((x) => x.c.date === focus.date) ?? matched[0];
  if (!hit) return null;
  const { c, gi } = hit;
  const g = must(solution.groups[gi], `group ${gi}`);
  const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
  const groupCharges = charges.filter((_, k) => solution.assign[k] === gi);
  const items = g.members.flatMap(
    (x) => must(order.shipments[x], `delivery ${x + 1}`).items,
  );
  const split = splitGroup(items, groupCharges, absorbed).find(
    (sp) => sp.charge === c,
  );
  // splitGroup returns one split per charge, so this shouldn't happen; fall back to the full view.
  if (!split) return null;
  const boxes = g.members.map(
    (x) => must(order.shipments[x], `delivery ${x + 1}`).box,
  );
  const box = must(
    order.shipments[Math.min(...g.members)],
    `delivery ${Math.min(...g.members) + 1}`,
  ).box;
  $$(".acs-panel,.acs-banner,.acs-result").forEach((e) => {
    e.remove();
  });
  const dn = g.members.map((x) => `Delivery ${x + 1}`).join(" + ");

  const body: Node[] = [];
  if (groupCharges.length > 1) {
    body.push(
      el(
        "div",
        "acs-muted",
        `Amazon billed this delivery in ${groupCharges.length} charges (${groupCharges.map((x) => fmt(x.amount)).join(" + ")}). This is the ${fmt(c.amount)} one.`,
      ),
    );
  }
  if (absorbed > 0) {
    body.push(
      el(
        "div",
        "acs-muted",
        `${fmt(absorbed)} of this delivery was paid with points or a gift card.`,
      ),
    );
  }
  body.push(splitTable(split, false));
  warnings.forEach((w) => {
    body.push(el("div", "acs-warn", esc(w)));
  });
  const panel = resultPanel(suite, {
    amount: fmt(c.amount),
    meta: `${c.date} · ${c.method} · ${dn}`,
    body,
    onDismiss: () => {
      for (const e of $$(".acs-glow")) e.classList.remove("acs-glow");
    },
  });
  box.insertBefore(panel, box.firstChild);
  panel.scrollIntoView?.({ block: "center" });
  return { panel, boxes };
}
