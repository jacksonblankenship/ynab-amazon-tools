// The YNAB register: hovering an Amazon transaction shows a search button that opens Amazon's
// transactions page at that charge or refund. Built on real register rows (see
// test/fixtures/README.md): amounts drawn as <bdi>$</bdi>12.34, splits with sub-rows.
import { describe, expect, test } from "vitest";
import { loadPage } from "../test/html.ts";
import registerRows from "../test/fixtures/ynab/register-rows.html?raw";
import { gm } from "../test/gm.ts";
import { rowFor, saveAnswer } from "./answers.ts";
import { ynabPage } from "./ynab-page.ts";
import { planFor } from "./ynab-lookup.ts";

function openRegister(rows = registerRows) {
  loadPage(`<html><body><div class="ynab-grid-body">${rows}</div></body></html>`);
  ynabPage();
}

const rows = () => [...document.querySelectorAll(".ynab-grid-body-row")];
function row(i: number) {
  const r = rows()[i];
  if (!r) throw new Error(`no row ${i}`);
  return r;
}
/** The row whose date and outflow/inflow cells read as given. */
function rowWith(date: string, money: string) {
  const r = rows().find(
    (x) =>
      x.querySelector(".ynab-grid-cell-date")?.textContent === date &&
      [".ynab-grid-cell-outflow", ".ynab-grid-cell-inflow"].some(
        (c) => x.querySelector(c)?.textContent === money,
      ),
  );
  if (!r) throw new Error(`no row ${date} ${money}`);
  return r;
}

/** Point at a cell in the row, as the mouse would. */
function hover(r: Element) {
  const cell = r.querySelector(".ynab-grid-cell-memo") ?? r;
  cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}
const button = () => {
  const b = document.querySelector<HTMLAnchorElement>(".acs-yn");
  if (!b) throw new Error("no button");
  return b;
};
const afterHide = () => new Promise((r) => setTimeout(r, 0));
/** Where the button leads: the search it hands to Amazon's transactions page. */
function search() {
  const url = new URL(button().href);
  expect(`${url.origin}${url.pathname}`).toBe(
    "https://www.amazon.com/cpe/yourpayments/transactions",
  );
  return Object.fromEntries(new URLSearchParams(url.hash.slice(1)));
}

describe("hovering an Amazon row", () => {
  test("an outflow is a charge, with its amount in cents and its date", () => {
    openRegister();
    hover(rowWith("2026-09-11", "$236.52"));
    expect(button().style.display).toBe("flex");
    expect(search()).toEqual({
      "acs-find": "23652",
      "acs-date": "2026-09-11",
      "acs-kind": "charge",
    });
  });

  test("an inflow is a refund", () => {
    openRegister();
    hover(rowWith("2026-09-11", "$68.64"));
    expect(search()).toEqual({
      "acs-find": "6864",
      "acs-date": "2026-09-11",
      "acs-kind": "refund",
    });
  });

  test("a refund's YNAB plan waits in Tampermonkey's storage, never in the link to Amazon", () => {
    const plan = "b49ec261-e368-45d9-8d7c-be85300bf1d4";
    history.replaceState(null, "", `/${plan}/accounts`);
    openRegister();
    hover(rowWith("2026-09-11", "$68.64"));
    expect(button().href).not.toContain(plan);
    expect(planFor(6864)).toBe(plan);
    // A charge doesn't need it.
    hover(rowWith("2026-09-11", "$236.52"));
    expect(planFor(23652)).toBeUndefined();
    history.replaceState(null, "", "/");
  });

  test("a split's parent row searches for the whole charge", () => {
    openRegister();
    hover(row(0));
    expect(search()).toEqual({
      "acs-find": "10568",
      "acs-date": "2026-09-14",
      "acs-kind": "charge",
    });
  });

  test("a split's sub-row shows no button", async () => {
    openRegister();
    hover(row(0));
    const sub = row(1);
    expect(sub.hasAttribute("data-row-id")).toBe(false);
    hover(sub);
    await afterHide();
    expect(button().style.display).toBe("none");
  });

  test("the running balance's minus sign and thousands don't leak into the amount", () => {
    openRegister();
    // This row's balance reads −$1,723.14.
    hover(rowWith("2026-09-09", "$908.00"));
    expect(search()["acs-find"]).toBe("90800");
  });

  test("an amount over a thousand is read whole", () => {
    openRegister(registerRows.replace("<bdi>$</bdi>345.48", "<bdi>$</bdi>1,345.48"));
    hover(rowWith("2026-09-07", "$1,345.48"));
    expect(search()["acs-find"]).toBe("134548");
  });

  test("a day-first date with a day over 12 is read the right way round", () => {
    openRegister(registerRows.replaceAll("2026-09-13", "13/09/2026"));
    hover(rowWith("13/09/2026", "$43.24"));
    expect(search()["acs-date"]).toBe("2026-09-13");
  });

  test("an ambiguous month/day date offers both readings until another row settles it", () => {
    const usOnly = registerRows.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_m, y, mo, d) =>
      Number(d) > 12 ? "" : `${mo}/${d}/${y}`,
    );
    openRegister(usOnly);
    hover(rowWith("09/07/2026", "$43.08"));
    expect(search()["acs-date"]).toBe("2026-09-07,2026-07-09");
    openRegister(usOnly.replace("09/06/2026", "09/16/2026"));
    hover(rowWith("09/07/2026", "$43.08"));
    expect(search()["acs-date"]).toBe("2026-09-07");
  });
});

describe("rows that aren't Amazon orders", () => {
  test.each(["Corner Grocery", "Amazon Web Services", "AWS EMEA"])(
    "a %s row shows no button",
    async (payee) => {
      openRegister(registerRows.replace(">Amazon</span>", `>${payee}</span>`));
      hover(row(3)); // the next Amazon row, so the button is up first
      expect(button().style.display).toBe("flex");
      hover(row(0));
      await afterHide();
      expect(button().style.display).toBe("none");
    },
  );

  test.each(["Amazon.com", "AMZN Mktp US", "Amazon Prime"])("a %s row does", (payee) => {
    openRegister(registerRows.replace(">Amazon</span>", `>${payee}</span>`));
    hover(row(0));
    expect(button().style.display).toBe("flex");
  });

  test("a row with no amount shows no button", async () => {
    openRegister(registerRows.replace("<bdi>$</bdi>105.68", "<bdi>$</bdi>0.00"));
    hover(row(0));
    await afterHide();
    expect(button().style.display).not.toBe("flex");
  });
});

describe("opening a line on Amazon", () => {
  test("leaves the YNAB line for the Amazon tab, with its transaction id, outside the link", () => {
    openRegister();
    const r = rowWith("2026-09-11", "$236.52");
    hover(r);
    button().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const id = r.getAttribute("data-row-id") ?? "";
    expect(id).not.toBe("");
    expect(rowFor(23652, "charge", "September 10, 2026")).toEqual({
      amount: 23652,
      kind: "charge",
      date: "2026-09-11",
      id,
    });
    expect(button().href).not.toContain(id);
  });

  test("a middle-click leaves it too", () => {
    openRegister();
    hover(rowWith("2026-09-11", "$68.64"));
    button().dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(rowFor(6864, "refund", "September 10, 2026")?.date).toBe("2026-09-11");
  });

  test("hovering alone leaves nothing", () => {
    openRegister();
    hover(rowWith("2026-09-11", "$236.52"));
    expect(rowFor(23652, "charge", "September 10, 2026")).toBeUndefined();
  });
});

describe("a line already worked out on Amazon", () => {
  const CHARGE_ROW = { amount: 23652, kind: "charge" as const, date: "2026-09-11" };
  /** Hover the line and click its button, as the user would; returns whether it opened Amazon. */
  function click(date: string, money: string) {
    const r = rowWith(date, money);
    hover(r);
    return button().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }
  const panel = () => document.querySelector(".acs-result");
  const idOf = (date: string, money: string) =>
    rowWith(date, money).getAttribute("data-row-id") ?? "";

  test("shows what it paid for in YNAB, with amounts, instead of opening Amazon", () => {
    openRegister();
    saveAnswer(
      { ...CHARGE_ROW, id: idOf("2026-09-11", "$236.52") },
      {
        orderId: "114-7767348-8987501",
        items: [
          { title: "Cordless Drill", amount: 20000, qty: 1 },
          { title: "Drill Bits", amount: 3652, qty: 2 },
        ],
        exact: true,
        cautions: ["Part of this order was paid with points shared with another order."],
      },
    );
    expect(click("2026-09-11", "$236.52")).toBe(false);
    const text = panel()?.textContent ?? "";
    expect(text).toMatch(/Cordless Drill.*\$200\.00/);
    expect(text).toMatch(/Drill Bits.*×2.*\$36\.52/);
    expect(text).toMatch(/\$236\.52/);
    expect(text).toMatch(/114-7767348-8987501/);
    expect(text).toMatch(/shared with another order/);
    // Nothing asked of Amazon.
    expect(gm.requests()).toHaveLength(0);
  });

  test("says when the amounts are each item's estimated share", () => {
    openRegister();
    saveAnswer(
      { ...CHARGE_ROW, id: idOf("2026-09-11", "$236.52") },
      {
        orderId: "114-7767348-8987501",
        items: [
          { title: "Cordless Drill", amount: 20000, qty: 1 },
          { title: "Drill Bits", amount: 3652, qty: 1 },
        ],
        exact: false,
        cautions: [],
      },
    );
    click("2026-09-11", "$236.52");
    expect(panel()?.textContent).toMatch(/each item's share/);
  });

  test("a refund shows the category it goes back to, and what it was probably for", () => {
    openRegister();
    saveAnswer(
      { amount: 6864, kind: "refund", date: "2026-09-11", id: idOf("2026-09-11", "$68.64") },
      {
        orderId: "114-0271446-2821572",
        items: [{ title: "Packable Rain Jacket", amount: 6864, qty: 1 }],
        exact: false,
        category: { names: [{ name: "Fun Money", amount: 8008 }], confident: true },
        cautions: [],
      },
    );
    expect(click("2026-09-11", "$68.64")).toBe(false);
    const put = document.querySelector(".acs-put")?.textContent ?? "";
    expect(put).toContain("$68.64");
    expect(put).toContain("Fun Money");
    expect(panel()?.textContent).toMatch(/Rain Jacket/);
  });

  test("a refund's guess between categories names each", () => {
    openRegister();
    saveAnswer(
      { amount: 6864, kind: "refund", date: "2026-09-11", id: idOf("2026-09-11", "$68.64") },
      {
        orderId: "114-0271446-2821572",
        items: [],
        exact: false,
        category: {
          names: [
            { name: "Fun Money", amount: 8008 },
            { name: "Kids: School", amount: 8008 },
          ],
          confident: false,
        },
        cautions: ["YNAB has another $80.08 Amazon charge near this date, in Kids: School."],
      },
    );
    click("2026-09-11", "$68.64");
    const put = document.querySelector(".acs-put")?.textContent ?? "";
    expect(put).toMatch(/Fun Money/);
    expect(put).toMatch(/Kids: School/);
    expect(put).not.toMatch(/^Put/);
    expect(panel()?.textContent).toMatch(/another \$80\.08/);
  });

  test('"Open on Amazon" still opens the line there, and leaves it for the Amazon tab', () => {
    openRegister();
    const id = idOf("2026-09-11", "$236.52");
    saveAnswer({ ...CHARGE_ROW, id }, { orderId: "1", items: [], exact: true, cautions: [] });
    click("2026-09-11", "$236.52");
    const open = [...(panel()?.querySelectorAll("a") ?? [])].find((a) =>
      /Open on Amazon/.test(a.textContent ?? ""),
    );
    if (!open) throw new Error("no Open on Amazon link");
    expect(open.href).toBe(button().href);
    expect(open.target).toBe("_blank");
    open.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(rowFor(23652, "charge", "September 10, 2026")?.id).toBe(id);
  });

  test("another line of the same amount isn't answered by it", () => {
    openRegister();
    saveAnswer(
      { ...CHARGE_ROW, id: "someone-else" },
      { orderId: "1", items: [], exact: true, cautions: [] },
    );
    expect(click("2026-09-11", "$236.52")).toBe(true);
    expect(panel()).toBeNull();
  });
});
