// YNAB: "Find on Amazon" button on Amazon transactions.
import { ynabButton } from "./lib/ynab.ts";
import { AMAZON_PAYEE, planIn, rememberPlan } from "./ynab-lookup.ts";

export const ynabPage = () =>
  ynabButton({
    payee: AMAZON_PAYEE,
    prefix: "acs",
    label: "Find on Amazon",
    // A refund's plan on screen goes to Tampermonkey's storage, not the link, so the Amazon tab
    // can look up its category without Amazon's page ever seeing it. Left when the link is
    // pointed at, so a middle-click or a keyboard opening gets it too.
    href: (c) => {
      const plan = c.kind === "refund" ? planIn(location.pathname) : undefined;
      if (plan) rememberPlan(c.amount, plan);
      return `https://www.amazon.com/cpe/yourpayments/transactions#acs-find=${c.amount}&acs-date=${c.dates.join(",")}&acs-kind=${c.kind}`;
    },
  });
