# Changelog

## [0.2.0](https://github.com/jacksonblankenship/ynab-amazon-tools/compare/v0.1.0...v0.2.0) (2026-11-13)


### Features

* cache seen amazon transactions to avoid repeat requests ([aa82485](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/aa82485d3c5c3c0864a53dd9d82288966243cc53))
* link to the issues page when amazon's page can't be read ([d0c2926](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/d0c2926785117eeee4dad59d4e874966cef50e2f))


### Bug Fixes

* don't call a refused sign-in amazon rate limiting ([91d08b7](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/91d08b714505a7220b9fa2ed0528065d6c2e5588))
* don't match transactions with unreadable dates ([c2f3026](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/c2f3026c91381ba180f411be93c1ae9f71138e05))
* drop the charge-only posting note from refund searches ([cf60a4a](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/cf60a4a17d1b085d1aee55b12526d035ba2b2f87))
* find charges for digital orders instead of saying none ([c97167e](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/c97167eee845be839c45a4cfd0324dd2eb918b10))
* keep the refund panel readable on ynab's dark theme ([64ec424](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/64ec424a3bad70cfac5ebe8fc5c932dea57c735b))
* let a tall floating panel scroll ([fbbc3a5](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/fbbc3a5b9bab33597810cb5c361a4b1080cefa61))
* link digital orders where amazon itself does ([c7fb7c7](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/c7fb7c7324faad4f08278a2a15eef4528fa44111))
* pick the charge nearest the clicked date on an order page ([941aef8](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/941aef860ca35701cc0b8a2de147882dc474e1c1))
* read amazon's new transaction service answer ([6b3dd73](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/6b3dd737b437c319c6dbe136af4bc57e3a01814d))
* say so when an order page's items or prices can't be read ([32929a6](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/32929a62e3b7e805ec6aee66910cbdadb4f93238))
* stop caching the same amazon charge twice ([8cf97ec](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/8cf97ec559523f4e7b31ecd21968d544db9cbc93))
* stop claiming coverage for days dropped from the cache ([e073cd7](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/e073cd7d0bff0f92ed2546890628805307f9c0b5))
* stop early when the ynab date can't be read ([5293fa0](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/5293fa07d225c87df861a7d32982c84bd5012f3b))
* tell a changed transactions page apart from throttling ([17d1ab4](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/17d1ab47a458b82c87f14ac3f4aa2db0a9f2a7ce))
* wait out a 503 from amazon like a 429 ([fd4245c](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/fd4245c6d7476e9b6a1f45e8f514aaf7bf20fe09))
* weigh cached transactions alongside the page's rows ([9e167cc](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/9e167ccce225fc0fd734077f550e2e25bcbd6d72))
* write amounts over $999 with thousands separators ([af99484](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/af994848b81272e09a03b56ebe49db2080b12f11))

## [0.1.0](https://github.com/jacksonblankenship/ynab-amazon-tools/compare/v0.1.0...v0.1.0) (2026-11-13)


### Miscellaneous Chores

* release 0.1.0 ([d5e40d5](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/d5e40d5ecc96eeb32383e910b6479aa98b94fb12))
