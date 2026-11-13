<p align="center">
  <img src="assets/icon.svg" width="96" height="96" alt="">
</p>

<h1 align="center">Amazon Charge Finder for YNAB</h1>

<p align="center">
  Your YNAB register says <em>Amazon, Amazon, Amazon</em>. This tells you what
  each one was.
</p>

<p align="center">
  <a href="https://github.com/jacksonblankenship/ynab-amazon-tools/releases/latest/download/amazon-charge-finder.user.js"><img src="https://img.shields.io/badge/Install-Tampermonkey-00485b?style=for-the-badge&logo=tampermonkey&logoColor=white" alt="Install with Tampermonkey"></a>
</p>

## What you get

- **The order behind every charge.** Hover an Amazon transaction in YNAB and
  click the search icon. You land on the Amazon order that charge paid for, with
  the items it covered highlighted.
- **Split-ready amounts.** When Amazon bills one order as several charges, it
  shows which charge paid for which items, tax and shipping included. Click an
  amount to copy it for your split in YNAB. On any
  order page, **Match charges to items** shows this for the whole order.
- **Refunds in the right category.** Click the search icon on a refund. The
  Amazon page tells you which YNAB category it goes back to, and names the one
  split line when the original charge was split. Your YNAB tab shows the same
  answer.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net) in your browser.
2. Click **Install with Tampermonkey** at the top, then confirm.

Tampermonkey checks this repository's releases for updates and installs them on
its own.

## What it can access

It runs on Amazon's order and transaction pages and on app.ynab.com, inside tabs
you're already signed in to. It never sees your passwords.

- **It only reads.** It never buys, cancels, edits, or deletes anything on
  Amazon or in YNAB.
- **It talks only to Amazon and YNAB.** There's no server behind it, no
  analytics, and no tracking.
- **It stores some data in Tampermonkey, on your computer.** It keeps the Amazon
  transactions it has seen (amount, date, order number, status, and card name
  with its last 4 digits) so it doesn't ask Amazon twice. It also keeps a log of when it
  loaded data from Amazon, and passes a refund's order details to your YNAB tab
  the same way. Saved transactions are cleared when you sign in to a different
  Amazon account, or any time with **Forget saved Amazon transactions** in
  Tampermonkey's menu.
- **Refund answers show on Amazon's page.** For a refund, the Amazon page shows
  YNAB category names and amounts, so Amazon's page can read them. It never
  shows memos, payees, or account names there. The token is only ever typed in
  on YNAB.
- **The YNAB token is optional.** Only refund categories need it. You create a
  [personal access token](https://api.ynab.com/#personal-access-tokens) in YNAB.
  The script keeps it in Tampermonkey, sends it only to `api.ynab.com`, and uses
  it only to read. Remove it any time with **Forget YNAB token** in
  Tampermonkey's menu.

## Check it yourself

Don't take my word for any of this. The full source is in [`src/`](src), each
release is built from it by
[GitHub Actions](.github/workflows/release-please.yml), and the installed file
isn't minified, so you can read what runs. Tampermonkey shows you the whole
script before you confirm.

An AI coding agent can do the reading for you. Point it at this repository and
ask something like:

> Review this Tampermonkey script for anything that could harm me: data sent
> anywhere other than Amazon or YNAB, changes made to either account, or
> anything sensitive it stores. Check that the README's claims match the code.

## Good to know

- Works with **amazon.com** (US) accounts, one Amazon account per browser.
- Amazon limits how fast its pages load. The script keeps requests to a minimum,
  and if Amazon pushes back, it tells you how long to wait.
- Amazon and YNAB change their pages without warning. If something breaks, or
  you find a problem in the code,
  [open an issue](https://github.com/jacksonblankenship/ynab-amazon-tools/issues/new)
  or send a pull request.

## Disclaimer

This is a personal open-source project. I built it for my own YNAB routine and
share it in case it helps you too. It isn't reviewed, endorsed, or supported by
YNAB or Amazon. Use it at your own risk: it comes as is, with no warranty (see
the [license](LICENSE)).

We are not affiliated, associated, or in any way officially connected with YNAB
or any of its subsidiaries or affiliates. The official YNAB website can be found
at https://www.ynab.com. The names YNAB and You Need A Budget, as well as related
names, tradenames, marks, trademarks, emblems, and images are registered
trademarks of YNAB. Amazon is a trademark of Amazon.com, Inc. or its affiliates.

## License

[MIT](LICENSE)
