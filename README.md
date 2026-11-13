# Amazon Charge Finder for YNAB

Your YNAB register says _Amazon, Amazon, Amazon_. This tells you what each one
was.

Hover an Amazon transaction in YNAB and click the search icon. You land on the
Amazon order that charge paid for, with the items it covered highlighted.

[![Install with Tampermonkey](https://img.shields.io/badge/Install-Tampermonkey-00485b?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://github.com/jacksonblankenship/ynab-amazon-tools/releases/latest/download/amazon-charge-finder.user.js)

## What you get

- **The order behind every charge.** No more scrolling your order history to
  match amounts and dates.
- **Split-ready amounts.** When Amazon bills one order as several charges, it
  shows which charge paid for which items, tax and shipping included.
- **Refunds in the right category.** It finds the charge a refund reverses and
  shows the YNAB category that charge was filed under.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net) in your browser.
2. Click **Install with Tampermonkey** above, then confirm.

Updates arrive on their own.

## Your data stays yours

A browser script that touches your finances should earn your trust, so here is
exactly what this one does:

- **It only reads.** It never buys, cancels, edits, or deletes anything on Amazon
  or in YNAB.
- **It never sees your passwords.** It works inside the Amazon and YNAB tabs
  you're already signed in to.
- **Nothing is sent anywhere.** No server, no analytics, no tracking. It runs
  only on amazon.com and app.ynab.com.
- **Refund categories are opt-in.** They need a read-only call to YNAB's
  official API with a [personal access token](https://api.ynab.com/#personal-access-tokens)
  you provide. The token stays in Tampermonkey and is sent only to
  `api.ynab.com`. Everything else works without it.
- **You can check all of this.** The source is in [`src/`](src), and each
  release is built from it by GitHub Actions. The installed file is readable,
  not minified, and Tampermonkey shows it to you before you confirm.

## Good to know

- Works with **amazon.com** (US) accounts.
- Amazon limits how fast its pages load. The script keeps requests to a minimum,
  and if Amazon pushes back, it tells you to wait a few minutes.
- Amazon and YNAB change their pages without warning. If something breaks,
  [open an issue](https://github.com/jacksonblankenship/ynab-amazon-tools/issues).

## License

MIT
