// Reading real (scrubbed) Amazon order pages: the deliveries, their items and the Order
// Summary, and the tax-in estimate each item gets. Expected values come from
// test/fixtures/README.md, not from the parser.
import { describe, expect, test } from "vitest";
import giftCard from "../test/fixtures/amazon/order-gift-card.html?raw";
import refund from "../test/fixtures/amazon/order-refund.html?raw";
import sharedOther from "../test/fixtures/amazon/order-shared-points-other.html?raw";
import shared from "../test/fixtures/amazon/order-shared-points.html?raw";
import threeDeliveries from "../test/fixtures/amazon/order-three-deliveries.html?raw";
import { loadPage } from "../test/html.ts";
import { parseOrder, priceItems } from "./order.ts";

const read = (html: string) => priceItems(parseOrder(loadPage(html)));

/** Each delivery as [title start, unit price, qty] per item. */
const itemsOf = (html: string) =>
  read(html).order.shipments.map((s) =>
    s.items.map((i) => [i.title.split(",")[0], i.price, i.qty] as const),
  );

describe("an order with two deliveries and shared points", () => {
  test("reads the order number, items and quantities per delivery", () => {
    const { order, warnings, changed } = read(shared);
    expect(order.orderId).toBe("114-7767348-8987501");
    expect(itemsOf(shared)).toEqual([
      [
        ["Stainless Steel Mixing Bowls", 3996, 2],
        ["Silicone Baking Mat", 2796, 1],
        ["Microfiber Cleaning Cloths", 3996, 1],
      ],
      [["Cast Iron Skillet", 23996, 1]],
    ]);
    expect(warnings).toEqual([]);
    expect(changed).toBe(false);
  });

  test("reads the summary, with the points as a credit", () => {
    const { summary } = read(shared).order;
    expect(summary).toMatchObject({
      subtotal: 38780,
      beforeTax: 38780,
      tax: 3196,
      preTaxAdj: 0,
      credits: 2324,
      grand: 39652,
    });
  });

  test("estimates each delivery with its share of the tax", () => {
    const { shipments } = read(shared).order;
    expect(shipments.map((s) => s.total)).toEqual([16002, 25974]);
    // Tax-in, the deliveries add up to the order before points.
    expect(shipments.reduce((a, s) => a + s.total, 0)).toBe(41976);
  });

  test("keeps a delivered status to its first sentence", () => {
    const { shipments } = read(shared).order;
    expect(shipments.map((s) => s.status)).toEqual([
      "Delivered September 10",
      "Delivered September 10",
    ]);
  });

  test("the other order, paid entirely in points, totals zero", () => {
    const { order } = read(sharedOther);
    expect(order.orderId).toBe("114-4442968-2608428");
    expect(itemsOf(sharedOther)).toEqual([[["Bamboo Cutting Board", 2672, 1]]]);
    expect(order.summary).toMatchObject({ subtotal: 2672, tax: 220, credits: 2892, grand: 0 });
    expect(order.shipments[0]?.total).toBe(2892);
  });
});

describe("an order with three deliveries and an item coupon", () => {
  test("reads the three deliveries and their items", () => {
    const { order } = read(threeDeliveries);
    expect(order.orderId).toBe("114-0890458-9035361");
    expect(itemsOf(threeDeliveries)).toEqual([
      [["LED Desk Lamp with USB Charging Port", 2097, 1]],
      [
        ["Ceramic Coffee Mug", 1647, 1],
        ["Glass Food Storage Containers with Lids", 2064, 1],
        ["Cotton Bath Towels", 2064, 1],
      ],
      [
        ["Wireless Mouse", 1497, 1],
        ["Spiral Notebooks", 1647, 1],
        ["Stainless Steel Water Bottle", 1797, 1],
        ["Cable Organizer Clips", 1764, 1],
      ],
    ]);
    expect(order.shipments.map((s) => s.status)).toEqual([
      "Delivered September 10",
      "Delivered September 9",
      "Delivered September 9",
    ]);
  });

  test("reads the coupon as a pre-tax adjustment and the points as a credit", () => {
    expect(read(threeDeliveries).order.summary).toMatchObject({
      subtotal: 14577,
      beforeTax: 14277,
      tax: 1179,
      preTaxAdj: -300,
      credits: 2640,
      grand: 12816,
    });
  });

  test("spreads the coupon over every item, as the README documents", () => {
    // Amazon applied the coupon to delivery 3 only; the page doesn't say so, so the
    // estimates are off. Matching has to cope (see order-page.test.ts).
    const { shipments } = read(threeDeliveries).order;
    expect(shipments.map((s) => s.total)).toEqual([2224, 6123, 7109]);
  });
});

describe("an order paid with a gift card and a card", () => {
  test("reads the gift card as a credit against one delivery", () => {
    const { order } = read(giftCard);
    expect(order.orderId).toBe("114-3317431-5179528");
    expect(itemsOf(giftCard)).toEqual([[["Paper Towels", 13708, 1]]]);
    expect(order.summary).toMatchObject({ subtotal: 13708, tax: 0, credits: 9512, grand: 4196 });
    expect(order.shipments.map((s) => s.total)).toEqual([13708]);
    expect(order.shipments[0]?.status).toBe("Delivered September 9");
  });
});

describe("a partly refunded order", () => {
  test("a Refund Total after the Grand Total leaves the summary alone", () => {
    const { order, warnings } = read(refund);
    expect(order.orderId).toBe("114-0271446-2821572");
    expect(order.summary).toMatchObject({
      subtotal: 7398,
      tax: 610,
      preTaxAdj: 0,
      credits: 0,
      grand: 8008,
    });
    expect(order.summary.lines.map(([label]) => label)).not.toContain("Refund Total");
    expect(order.shipments.map((s) => s.total)).toEqual([8008]);
    expect(warnings).toEqual([]);
  });

  test("reads the refunded item", () => {
    expect(itemsOf(refund)).toEqual([[["Packable Rain Jacket", 7398, 1]]]);
  });
});

describe("when Amazon changes the order page", () => {
  test("without the Order Summary it says so instead of guessing tax", () => {
    const doc = loadPage(threeDeliveries);
    doc.querySelector('[data-component="chargeSummary"]')?.remove();
    const { order, warnings, changed } = priceItems(parseOrder(doc));
    expect(changed).toBe(true);
    expect(order.summary.grand).toBeNull();
    expect(warnings.join(" ")).toMatch(/couldn't read the order summary/i);
  });

  test("an item without a readable price is counted, not priced at zero silently", () => {
    const doc = loadPage(shared);
    for (const p of doc.querySelectorAll('[data-component="unitPrice"]')) p.remove();
    const parsed = parseOrder(doc);
    expect(parsed.unpriced).toBe(4);
    expect(priceItems(parsed).changed).toBe(true);
  });
});
