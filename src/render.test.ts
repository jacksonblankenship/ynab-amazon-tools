// The order page's panels: what they lead with, and what waits behind "How it matched".
// Orders are built by hand so each case (one item, several charges, points) is exact.
import { afterEach, describe, expect, test, vi } from "vitest";
import { howItMatched, renderFocus, renderOrder } from "./render.ts";
import css from "./style.css?raw";
import type { Focus, Order, PricedItem, Solution, Txn } from "./types.ts";

const item = (title: string, total: number, shipment = 0): PricedItem => ({
  title,
  price: total,
  qty: 1,
  ext: total,
  shipment,
  total,
});

const charge = (amount: number, date: string): Txn => ({
  method: "Visa ****1234",
  date,
  status: "Completed",
  el: null,
  orderId: "111-1111111-1111111",
  orderIds: ["111-1111111-1111111"],
  amount,
  kind: "charge",
});

/** One order whose deliveries hold `deliveries`; every charge paid the delivery at `paid`. */
function order(deliveries: PricedItem[][], paid: number) {
  const o: Order = {
    orderId: "111-1111111-1111111",
    shipments: deliveries.map((items, idx) => ({
      idx,
      box: document.body.appendChild(document.createElement("div")),
      status: "Delivered",
      items,
      total: items.reduce((a, i) => a + i.total, 0),
    })),
    summary: {
      subtotal: null,
      beforeTax: null,
      tax: 0,
      preTaxAdj: 0,
      discounts: 0,
      credits: 0,
      grand: null,
      lines: [],
    },
    unpriced: 0,
  };
  const solve = (charges: Txn[], absorbed = 0, coupon = 0): Solution => ({
    score: 0,
    groups: deliveries.map((_, x) => ({ members: [x], total: 0, tol: 0 })),
    assign: charges.map(() => paid),
    absorbedBy: deliveries.map((_, x) => (x === paid ? absorbed : 0)),
    couponBy: deliveries.map((_, x) => (x === paid ? coupon : 0)),
    sig: "",
    ambiguous: false,
  });
  return { order: o, solve };
}

const focus: Focus = { amount: 2732, date: "January 5, 2026", kind: "charge" };
const diapers = item("Huggies Size 3 Diapers", 1000);
const wipes = item("Clorox Wipes, 3 pack", 1732);

/** The panel's text a user sees without opening "How it matched". */
function visible(panel: HTMLElement) {
  const c = panel.cloneNode(true) as HTMLElement;
  c.querySelectorAll("details").forEach((d) => {
    d.remove();
  });
  return c.textContent;
}
const matched = (panel: HTMLElement) => {
  const d = panel.querySelector("details");
  expect(d?.querySelector("summary")?.textContent).toMatch(/how it matched/i);
  expect(d?.open).toBe(false);
  return d?.textContent ?? "";
};
/** Each item row of the split table: [name, amount]. */
const rows = (panel: HTMLElement) =>
  Array.from(panel.querySelectorAll(".acs-split tr:not(.acs-tot)"), (tr) =>
    Array.from(tr.querySelectorAll("td"), (td) => td.textContent.trim()),
  );
const total = (panel: HTMLElement) => panel.querySelector(".acs-split .acs-tot")?.textContent;

describe("the single-charge panel", () => {
  test("opens on the items and their amounts; the card and delivery wait behind a disclosure", () => {
    const { order: o, solve } = order([[item("Other delivery", 999)], [diapers, wipes]], 1);
    const charges = [charge(2732, "January 4, 2026")];
    const shown = renderFocus(o, charges, solve(charges), focus);
    const panel = shown?.panel as HTMLElement;
    expect(rows(panel)).toEqual([
      ["Huggies Size 3 Diapers", "$10.00"],
      ["Clorox Wipes, 3 pack", "$17.32"],
    ]);
    expect(total(panel)).toMatch(/\$27\.32/);
    // The items come first in the body, ahead of any explanation.
    expect(panel.querySelector(".acs-r-body")?.textContent).toMatch(/^\D*2 items/);
    // Tied to the YNAB row by its date; the card, Amazon's date and delivery are detail.
    expect(panel.querySelector(".acs-r-meta")?.textContent).toMatch(/January 5, 2026/);
    expect(visible(panel)).not.toMatch(/1234|Delivery|January 4/);
    expect(matched(panel)).toMatch(/Visa \*\*\*\*1234/);
    expect(matched(panel)).toMatch(/January 4, 2026/);
    expect(matched(panel)).toMatch(/Delivery 2/);
    // Still outlines the delivery it paid for.
    expect(shown?.boxes).toEqual([o.shipments[1]?.box]);
  });

  test("one item is named outright, with no table or total", () => {
    const { order: o, solve } = order([[item("Huggies Size 3 Diapers", 2732)]], 0);
    const charges = [charge(2732, "January 4, 2026")];
    const panel = renderFocus(o, charges, solve(charges), focus)?.panel as HTMLElement;
    expect(visible(panel)).toMatch(/Huggies Size 3 Diapers/);
    expect(panel.querySelector(".acs-split")).toBeNull();
  });

  test("one of several charges for a delivery: its own items, the other charges as detail", () => {
    const soap = item("Dish Soap", 1200);
    const tape = item("Packing Tape", 500);
    const { order: o, solve } = order([[diapers, soap, wipes, tape]], 0);
    const charges = [
      charge(1200, "January 4, 2026"),
      charge(2732, "January 5, 2026"),
      charge(500, "January 6, 2026"),
    ];
    const panel = renderFocus(o, charges, solve(charges), focus)?.panel as HTMLElement;
    expect(rows(panel)).toEqual([
      ["Huggies Size 3 Diapers", "$10.00"],
      ["Clorox Wipes, 3 pack", "$17.32"],
    ]);
    expect(visible(panel)).toMatch(/3 charges/);
    expect(visible(panel)).not.toMatch(/\$12\.00|\$5\.00/);
    expect(matched(panel)).toMatch(/\$12\.00/);
    expect(matched(panel)).toMatch(/\$5\.00/);
    // Each item went wholly to one charge, so there's nothing to caution about.
    expect(panel.querySelector(".acs-warn")).toBeNull();
  });

  test("when the charges don't divide the items cleanly, it cautions that the amounts are shares", () => {
    const { order: o, solve } = order([[diapers, wipes]], 0);
    const charges = [charge(2000, "January 4, 2026"), charge(732, "January 5, 2026")];
    const panel = renderFocus(o, charges, solve(charges), {
      ...focus,
      amount: 732,
    })?.panel as HTMLElement;
    expect(rows(panel).map(([, amount]) => amount)).toEqual(["$2.68", "$4.64"]);
    expect(panel.querySelector(".acs-warn")?.textContent).toMatch(/share/);
  });

  test("points or a gift card: the shrunk amounts say so, the full account is detail", () => {
    const { order: o, solve } = order([[diapers, wipes]], 0);
    const charges = [charge(2232, "January 4, 2026")];
    const panel = renderFocus(o, charges, solve(charges, 500), {
      ...focus,
      amount: 2232,
    })?.panel as HTMLElement;
    expect(rows(panel).map(([, amount]) => amount)).toEqual(["$8.17", "$14.15"]);
    expect(visible(panel)).toMatch(/\$5\.00 .*gift card/);
    expect(matched(panel)).toMatch(/\$5\.00 was paid with points or a gift card/);
  });

  test("a coupon isn't called points or a gift card", () => {
    const { order: o, solve } = order([[diapers, wipes]], 0);
    const charges = [charge(2232, "January 4, 2026")];
    const panel = renderFocus(o, charges, solve(charges, 500, 500), {
      ...focus,
      amount: 2232,
    })?.panel as HTMLElement;
    expect(visible(panel)).toMatch(/\$5\.00 .*coupon/);
    expect(panel.textContent).not.toMatch(/gift card/);
  });

  test("warnings and a changed page stay in view", () => {
    const { order: o, solve } = order([[diapers, wipes]], 0);
    const charges = [charge(2732, "January 4, 2026")];
    const panel = renderFocus(o, charges, solve(charges), focus, ["Double-check it"], true)
      ?.panel as HTMLElement;
    expect(visible(panel)).toMatch(/Double-check it/);
    expect(visible(panel)).toMatch(/changed/);
  });

  test("a charge the matcher didn't place shows nothing, for the whole order to show instead", () => {
    const { order: o, solve } = order([[diapers, wipes]], 0);
    const charges = [charge(2732, "January 4, 2026")];
    expect(renderFocus(o, charges, solve(charges), { ...focus, amount: 999 })).toBeNull();
  });
});

describe("copying amounts for a split", () => {
  /** A clipboard that records what's written, or refuses every write. */
  function clipboard(refuse = false) {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (t: string) => {
          if (refuse) throw new Error("denied");
          written.push(t);
        },
      },
    });
    return written;
  }
  afterEach(() => {
    vi.useRealTimers();
  });

  const panel = () => {
    const { order: o, solve } = order([[diapers, wipes]], 0);
    const charges = [charge(2732, "January 4, 2026")];
    return renderFocus(o, charges, solve(charges), focus)?.panel as HTMLElement;
  };
  const button = (p: HTMLElement, name: RegExp) => {
    const b = Array.from(p.querySelectorAll("button")).find((x) =>
      name.test(x.getAttribute("aria-label") ?? x.textContent),
    );
    if (!b) throw new Error(`no button ${name}`);
    return b;
  };

  test("each item amount and the total is a button that copies the bare amount", async () => {
    const written = clipboard();
    vi.useFakeTimers();
    const p = panel();
    for (const name of [/\$10\.00/, /\$17\.32/, /\$27\.32/]) {
      const b = button(p.querySelector(".acs-split") as HTMLElement, name);
      expect(b.type).toBe("button");
      b.click();
      await vi.waitFor(() => {
        expect(b.textContent).toMatch(/copied/i);
      });
    }
    expect(written).toEqual(["10.00", "17.32", "27.32"]);
    // The confirmation is brief: the amount comes back.
    await vi.runAllTimersAsync();
    expect(button(p, /\$17\.32/).textContent).toBe("$17.32");
  });

  test("amounts over a thousand copy without the comma", async () => {
    const written = clipboard();
    const { order: o, solve } = order([[item("Sofa", 123456)]], 0);
    const charges = [charge(123456, "January 4, 2026")];
    const p = renderOrder(o, {
      charges,
      credits: [],
      refunds: [],
      solution: solve(charges),
      warnings: [],
      error: null,
      changed: false,
    }).panel;
    button(p, /Total|\$1,234\.56/).click();
    await vi.waitFor(() => {
      expect(written).toEqual(["1234.56"]);
    });
  });

  test("copy memo writes the item names only", async () => {
    const written = clipboard();
    button(panel(), /memo/i).click();
    await vi.waitFor(() => {
      expect(written).toEqual(["Huggies Size 3 Diapers, Clorox Wipes, 3 pack"]);
    });
  });

  test("a refused copy says so instead of claiming it worked", async () => {
    clipboard(true);
    const b = button(panel(), /\$17\.32/);
    b.click();
    await vi.waitFor(() => {
      expect(b.textContent).toMatch(/couldn't/i);
    });
  });

  test.each([
    ["a copy", false, "Copied"],
    ["a refused copy", true, "Couldn't copy"],
  ])("screen readers hear how %s went", async (_name, refuse, said) => {
    clipboard(refuse);
    const p = panel();
    document.body.append(p);
    for (const b of [button(p, /\$17\.32/), button(p, /memo/i)]) {
      b.click();
      await vi.waitFor(() => {
        expect(p.querySelector('[role="status"]')?.textContent).toBe(said);
      });
    }
    // One polite region for the panel, not one per button.
    expect(p.querySelectorAll('[role="status"]')).toHaveLength(1);
  });
});

describe("the whole-order panel", () => {
  test("shows each delivery's items; other payments, refunds and the link are detail", () => {
    const { order: o, solve } = order([[diapers, wipes]], 0);
    const charges = [charge(2732, "January 4, 2026")];
    const gift: Txn = { ...charge(500, "January 4, 2026"), method: "Amazon Gift Card" };
    const refund: Txn = { ...charge(1000, "January 12, 2026"), kind: "refund" };
    const { panel } = renderOrder(o, {
      charges,
      credits: [{ ...gift, kind: "credit" }],
      refunds: [refund],
      solution: solve(charges),
      warnings: [],
      error: null,
      changed: false,
    });
    expect(rows(panel)).toEqual([
      ["Huggies Size 3 Diapers", "$10.00"],
      ["Clorox Wipes, 3 pack", "$17.32"],
    ]);
    expect(visible(panel)).not.toMatch(/Gift Card|January 12/);
    expect(matched(panel)).toMatch(/Amazon Gift Card \$5\.00/);
    expect(matched(panel)).toMatch(/\$10\.00 on January 12, 2026/);
    expect(panel.querySelector("details a")?.getAttribute("href")).toMatch(/111-1111111-1111111/);
  });

  test("is capped in height on every screen, so it never fills the page", () => {
    const { panel } = renderOrder(order([[wipes]], 0).order, {
      charges: [],
      credits: [],
      refunds: [],
      solution: null,
      warnings: [],
      error: null,
      changed: false,
    });
    expect(panel.classList).toContain("acs-whole");
    const rule = css.match(/^\.acs-result\.acs-floating\.acs-whole \{([^}]*)\}/m)?.[1] ?? "";
    expect(rule).toMatch(/max-block-size: /);
  });
});

describe('"How it matched" and the refund answer\'s look', () => {
  test("one helper makes the disclosure, closed until asked for", () => {
    const how = howItMatched([document.createTextNode("detail")]);
    expect(how.tagName).toBe("DETAILS");
    expect(how.className).toBe("acs-how");
    expect(how.open).toBe(false);
    expect(how.querySelector("summary")?.textContent).toBe("How it matched");
  });

  test("its style is defined once, with a muted summary that isn't bold", () => {
    expect(css.match(/^\.acs-how \{/gm)).toHaveLength(1);
    const summary = css.match(/^\.acs-how summary \{([^}]*)\}/m)?.[1] ?? "";
    expect(summary).toMatch(/color: #51504d/);
    expect(summary).not.toMatch(/font-weight/);
  });

  test("a refund's waiting or error line isn't drawn in the answer's large bold", () => {
    const answer = css.match(/^\.acs-answer \{([^}]*)\}/m)?.[1] ?? "";
    expect(answer).not.toMatch(/font-weight|font-size/);
  });
});
