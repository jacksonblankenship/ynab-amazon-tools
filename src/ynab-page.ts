// YNAB: "Find on Amazon" button on Amazon transactions.
import { ynabButton } from "./lib/ynab.ts";

/**
 * Amazon payees, however the bank wrote them ("Amazon.com", "AMZN Mktp US", "Amazon Prime").
 * Amazon Web Services bills aren't Amazon orders.
 */
export const AMAZON_PAYEE = /^(?!.*(web services|\baws\b)).*(amazon|amzn)/i;

export const ynabPage = () =>
  ynabButton({
    payee: AMAZON_PAYEE,
    prefix: "acs",
    label: "Find on Amazon",
    href: (c) =>
      `https://www.amazon.com/cpe/yourpayments/transactions#acs-find=${c.amount}&acs-date=${c.dates.join(",")}&acs-kind=${c.kind}`,
  });
