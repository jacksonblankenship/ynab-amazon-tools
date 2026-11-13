// The YNAB register: hovering an Amazon transaction shows a search button that opens Amazon's
// transactions page at that charge or refund. Built on real register rows (see
// test/fixtures/README.md): amounts drawn as <bdi>$</bdi>12.34, splits with sub-rows.
import { describe, expect, test } from "vitest";
import { loadPage } from "../test/html.ts";
import registerRows from "../test/fixtures/ynab/register-rows.html?raw";
import { ynabPage } from "./ynab-page.ts";

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

  test("a refund also passes the YNAB plan on screen; a charge doesn't need it", () => {
    const plan = "b49ec261-e368-45d9-8d7c-be85300bf1d4";
    history.replaceState(null, "", `/${plan}/accounts`);
    openRegister();
    hover(rowWith("2026-09-11", "$68.64"));
    expect(search()["acs-plan"]).toBe(plan);
    hover(rowWith("2026-09-11", "$236.52"));
    expect(search()["acs-plan"]).toBeUndefined();
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
