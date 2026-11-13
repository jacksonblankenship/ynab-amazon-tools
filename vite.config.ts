import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  // Keep the shipped CSS readable, like the JS (which Vite leaves unminified for userscripts).
  build: { cssMinify: false },
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "Amazon Charge Finder for YNAB",
        namespace: "amazon-charge-finder-ynab",
        homepageURL: "https://github.com/jacksonblankenship/ynab-amazon-tools",
        supportURL: "https://github.com/jacksonblankenship/ynab-amazon-tools/issues",
        // Always the newest release, so Tampermonkey's update checks see new versions no
        // matter which release link the script was installed from.
        downloadURL:
          "https://github.com/jacksonblankenship/ynab-amazon-tools/releases/latest/download/amazon-charge-finder.user.js",
        description:
          "Shows which Amazon card charge paid for which items, so you can categorize or split it in YNAB. Hover an Amazon transaction in YNAB and click the search icon to jump straight to that charge's items. For a refund, it traces the original charge back to its YNAB category.",
        match: [
          "https://www.amazon.com/your-orders/order-details*",
          "https://www.amazon.com/cpe/yourpayments/transactions*",
          "https://app.ynab.com/*",
          "https://www.amazon.com/gp/your-account/order-details*",
          "https://www.amazon.com/gp/css/summary/edit.html*",
        ],
        grant: [
          "GM_getValue",
          "GM_setValue",
          "GM_addValueChangeListener",
          "GM_registerMenuCommand",
          "GM_xmlhttpRequest",
        ],
        connect: ["api.ynab.com"],
        "run-at": "document-start",
      },
      build: {
        fileName: "amazon-charge-finder.user.js",
      },
    }),
  ],
});
