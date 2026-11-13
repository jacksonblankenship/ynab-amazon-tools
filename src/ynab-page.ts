// YNAB: "Find on Amazon" button on Amazon transactions.
import { ynabButton } from "./lib/ynab.ts";
import { AMAZON_PAYEE, planIn } from "./ynab-lookup.ts";

export const ynabPage = () =>
  ynabButton({
    payee: AMAZON_PAYEE,
    prefix: "acs",
    label: "Find on Amazon",
    // A refund also takes the plan on screen, so the Amazon tab can look up its category.
    href: (c) => {
      const plan = c.kind === "refund" ? planIn(location.pathname) : undefined;
      return `https://www.amazon.com/cpe/yourpayments/transactions#acs-find=${c.amount}&acs-date=${c.dates.join(",")}&acs-kind=${c.kind}${plan ? `&acs-plan=${plan}` : ""}`;
    },
  });
