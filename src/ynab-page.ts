// YNAB: "Find on Amazon" button on Amazon transactions.
import { ynabButton } from "./lib/ynab.ts";

export const ynabPage = () =>
  ynabButton({
    // Amazon Web Services bills aren't Amazon orders.
    payee: /^(?!.*(web services|\baws\b)).*(amazon|amzn)/i,
    prefix: "acs",
    label: "Find on Amazon",
    href: (c) =>
      `https://www.amazon.com/cpe/yourpayments/transactions#acs-find=${c.amount}&acs-date=${c.dates.join(",")}&acs-kind=${c.kind}`,
  });
