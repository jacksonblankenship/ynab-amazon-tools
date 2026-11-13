// Shapes shared across the script's modules.

export interface Item {
  title: string;
  price: number;
  qty: number;
  ext: number;
  shipment: number;
}

/** An item after priceItems has given it a tax-in amount. */
export interface PricedItem extends Item {
  total: number;
}

export interface ParsedShipment {
  idx: number;
  box: Element;
  status: string | undefined;
  items: Item[];
}

/** A shipment after priceItems: priced items plus their tax-in sum. */
export interface Shipment extends Omit<ParsedShipment, "items"> {
  items: PricedItem[];
  total: number;
  /**
   * Coupons and promotions spread onto this delivery, tax-in. Amazon may have given all of
   * it to another delivery (an item-specific coupon), so its charges can exceed `total` by
   * about this much.
   */
  discount?: number;
}

export interface Summary {
  subtotal: number | null;
  beforeTax: number | null;
  tax: number;
  preTaxAdj: number;
  /** Coupons and promotions among the pre-tax adjustments, as a positive amount. */
  discounts: number;
  credits: number;
  grand: number | null;
  lines: [string, number][];
}

export interface ParsedOrder {
  orderId: string | null;
  shipments: ParsedShipment[];
  summary: Summary;
  /** Items whose price couldn't be read (a $0.00 item is read, not counted here). */
  unpriced: number;
}

export interface Order extends Omit<ParsedOrder, "shipments"> {
  shipments: Shipment[];
}

export interface Txn {
  method: string;
  date: string;
  status: string;
  /** The row on the page; null for a transaction read from Amazon's service. */
  el: Element | null;
  /** The order this transaction is for (the first, when it covers several). */
  orderId: string;
  /** Every order one charge covers; Amazon sometimes bills several together. */
  orderIds: string[];
  amount: number;
  kind: "refund" | "charge" | "credit";
}

/** Anything with an amount that splitGroup can divide among items. */
export interface Charge {
  amount: number;
}

export interface Group {
  members: number[];
  total: number;
  tol: number;
}

export interface Solution {
  score: number;
  groups: Group[];
  assign: number[];
  /** Points/gift-card credit, plus any coupon from couponBy, each group's charges fall short by. */
  absorbedBy: number[];
  /**
   * The part of absorbedBy that is a coupon the estimates spread onto other deliveries, which
   * ran over by that much. Null when several groups fall short, so which one got it is unknown.
   */
  couponBy: number[] | null;
  sig: string;
  ambiguous: boolean;
}

export interface SplitLine {
  item: PricedItem;
  amount: number;
}

export interface Split {
  charge: Charge;
  exact: boolean;
  lines: SplitLine[];
}

export interface RenderResult {
  charges: Txn[];
  credits: Txn[];
  refunds: Txn[];
  solution: Solution | null;
  warnings: string[];
  error: string | null;
  /** Part of Amazon's page couldn't be read: say so, with a way to report it. */
  changed: boolean;
}

export interface Focus {
  amount: number;
  date: string;
  kind: "charge" | "refund";
  /** The YNAB plan the refund was opened from (from Tampermonkey's storage), for its category. */
  plan?: string;
}

export interface FindQuery {
  amount: number;
  date: string;
  kind: string;
  pages: number;
  started: number;
}

/** A refund traced back to its order, handed from the Amazon tab to the YNAB tab. */
export interface Trace {
  at: number;
  orderId: string | null;
  refund: { amount: number; date: string; method: string };
  /** Every set of item units whose prices add up to the refund (several = a guess). */
  itemSets: { title: string; units: number; amount: number }[][];
  /** All of the order's card charges, any of which the refund may belong to. */
  charges: { amount: number; date: string; method: string }[];
  /** The YNAB lookup, when the Amazon tab already made it, so the YNAB tab needn't ask again. */
  lookup?: RefundLookup;
  /** Why the Amazon tab's lookup failed, so the YNAB tab shows it rather than ask again. */
  lookupError?: LookupError;
  /** Set once a YNAB tab has shown it, so it shows once. */
  shown?: boolean;
}

/** A YNAB lookup that failed: what to say, and whether the token or the script is at fault. */
export interface LookupError {
  error: string;
  badToken?: boolean;
  report?: boolean;
}

/** One YNAB charge line: its category (or each split line's). Amounts in cents. */
export interface YnabLine {
  category: string;
  memo: string;
  amount: number;
  /** A split line that matches the refund. */
  hit: boolean;
}

/** A refund's original charges as found in YNAB. Plain data, so it can go in a Trace. */
export interface RefundLookup {
  charges: {
    /** The Amazon charge looked for. */
    charge: Trace["charges"][number];
    /** The nearest YNAB charge of that amount; null when there's none. */
    found: {
      date: string;
      plan: string | null;
      /** Set when it was found in another plan than the one asked about. */
      planName: string | null;
      accountId: string | null;
      accountName: string;
      split: boolean;
      lines: YnabLine[];
      /** Another same-amount charge in other categories: either may be the order's. */
      alt: { date: string; categories: string[] } | null;
    } | null;
  }[];
  /** YNAB limited requests, so other plans weren't checked. */
  limited: boolean;
}
