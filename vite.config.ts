import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  // Ship readable code, so anyone can check what the installed script does (the README says so).
  build: { minify: false, cssMinify: false },
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "Amazon Charge Finder for YNAB",
        namespace: "amazon-charge-finder-ynab",
        author: "jacksonblankenship",
        icon: "https://raw.githubusercontent.com/jacksonblankenship/ynab-amazon-tools/main/assets/icon.svg",
        homepageURL: "https://github.com/jacksonblankenship/ynab-amazon-tools",
        supportURL: "https://github.com/jacksonblankenship/ynab-amazon-tools/issues/new",
        // Always the newest release, so Tampermonkey's update checks see new versions no
        // matter which release link the script was installed from.
        downloadURL:
          "https://github.com/jacksonblankenship/ynab-amazon-tools/releases/latest/download/amazon-charge-finder.user.js",
        updateURL:
          "https://github.com/jacksonblankenship/ynab-amazon-tools/releases/latest/download/amazon-charge-finder.user.js",
        description:
          "See the Amazon order and items behind each Amazon charge in YNAB. Hover an Amazon transaction and click the search icon. For a refund, it shows the YNAB category of the charge it reverses. Read-only, no tracking.",
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
