import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
    plugins: [
        monkey({
            entry: "src/main.js",
            userscript: {
                name: "Amazon Charge Finder for YNAB",
                namespace: "amazon-charge-finder-ynab", description: "Shows which Amazon card charge paid for which items, so you can categorize or split it in YNAB. Hover an Amazon transaction in YNAB and click the search icon to jump straight to that charge's items. For a refund, it traces the original charge back to its YNAB category.",
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
