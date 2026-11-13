# Changelog

## [0.4.0](https://github.com/jacksonblankenship/ynab-amazon-tools/compare/v0.3.0...v0.4.0) (2026-11-13)


### Features

* click an amount to copy it ([11d35e7](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/11d35e70b32533d82931636f8111f4815a14f096))
* keep what a YNAB line was found to be, for 90 days ([2f30165](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/2f30165482fac9abca477e5ac783109e1091fa70))
* lead the charge panel with its items ([db3d0af](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/db3d0af0ba10b0bc830ca22007774ae1f371e3c4))
* move the whole order's other payments behind "How it matched" ([bbf19e5](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/bbf19e559098eb6dffd55ee9f3e13de4771802d5))
* save the answer once Amazon works out a YNAB line ([c484437](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/c484437e782b00f4842d26b77381da146e192017))
* show a saved answer in YNAB instead of asking Amazon again ([de7bdc3](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/de7bdc37508c51fd119ffb147a2390e36531713f))
* show order page results in a floating panel ([27ab424](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/27ab424bb22e9496b8fcd6045f3b8d112bedd7f7))
* show where a refund goes on the Amazon panel ([b3cad46](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/b3cad461364eaba8c5a50fff56349d91afe9f570))
* tuck refund details behind "How it matched" ([154f345](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/154f345faf4393ebdef04226246136f5b8ecf479))


### Bug Fixes

* close gaps in the floating order panels found in review ([e6d2174](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/e6d21746d3fbc15f87876ff68c0f043419302a3e))
* define "How it matched" once and quiet the refund panel's status lines ([06c8eea](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/06c8eea546ccd3772b6da15e553dde43d088dd09))
* don't call coupon savings points or a gift card ([300c20c](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/300c20c3747b5e91e40f8d481c6bbc9fbada78a5))
* don't let an uncategorized split line hide the matching category ([f0934ca](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/f0934cab72e8eceeb576d7f79ca77add9e9b67d1))
* don't name one category when two matching charges disagree ([7678abd](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/7678abdc09424d76e237584807e92e6bc525a7ed))
* draw a hedged refund answer quieter than a sure one ([e414268](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/e414268c927004246f4e4fa9d8327a7f819861ea))
* hand a failed YNAB lookup to the YNAB tab instead of asking again ([1936203](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/193620370163d54a39a32bbe14349c8fbf039bc2))
* hedge a refund's answer when one of the order's charges isn't in YNAB ([7a61f61](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/7a61f61fbf220c3a1ba5bc6957321f10153fa751))
* keep the delivery the panel points at out from under it ([ddb0297](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/ddb029793aa312a0fe4eb0498bd50a19785df231))
* keep the YNAB plan id away from Amazon's page ([695eb99](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/695eb99001fda730df666008c22b3a4c57a5fb30))
* match charges on an order paid partly with shared points ([99587d5](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/99587d5eeb36add266c68fa196502fb3cdf3971a))
* match charges to the right deliveries when a coupon covers only some items ([7b3b3d3](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/7b3b3d36d1c65e6a019fb7788cf63f991ee7706f))
* name the one category when a split line matches ([c980511](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/c98051194da595e35760caa7e9cda506dc3a3533))
* only trust a coupon match when the overrun is the delivery's coupon share ([c7ac7ba](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/c7ac7ba20c266ee22203bd69513247098b317fd6))
* read amazon's first transactions from the page's data, not its layout ([7ae3441](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/7ae3441d494ed15c0d84dfaee91e5cfa45bf09f2))
* say once that the charges didn't load, and claim nothing about them ([0848028](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/084802805d01bc41b88cbb7a0ca737e7bc55f01e))
* send report links straight to a new issue ([79a5f9e](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/79a5f9ed5579128530c6cf487a68b44c3fba379c))
* skip damaged saved amazon transactions instead of failing every search ([60ce9b7](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/60ce9b78393f9f16634572209a879141600695a9))
* stop loading a web font from Google on Amazon pages ([cbd9bbe](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/cbd9bbe06199b20e8fb0883127a7aa1eded1da67))
* stop pointing at amounts below when a single item shows none ([36d223f](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/36d223f78d3e5c7ded82ee7365d89b60c3f529a1))
* tell screen readers when an amount is copied ([1dbe5d4](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/1dbe5d420c03a344c89595f37e4e33021129e2b2))
* tidy the floating order panels after a live check ([33267fa](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/33267fae398a7a51a011b29dab4f01e842e5ccc9))
* tidy the memo, the matching split line and the panel date ([077d38e](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/077d38e67b91c0f05bc866b2639f2db2d93192a0))

## [0.3.0](https://github.com/jacksonblankenship/ynab-amazon-tools/compare/v0.2.1...v0.3.0) (2026-11-13)


### Features

* give the script an icon and an author ([10e68a3](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/10e68a35cfdafe0b6ed3cc64b5281680cde3192f))


### Bug Fixes

* declare the update url tampermonkey checks for new versions ([7eda9e3](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/7eda9e3748aa281f19fefab98f6540de40337e95))
* say how long to wait when amazon may be limiting requests ([7315b7f](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/7315b7f666a311a8f0c1bf52997557b8b4fc8791))

## [0.2.1](https://github.com/jacksonblankenship/ynab-amazon-tools/compare/v0.2.0...v0.2.1) (2026-11-13)


### Bug Fixes

* don't call unfound refund charges uncategorized ([d4fd36b](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/d4fd36bbbc2fcdd717a41aeff3a2d5f166646950))
* don't match a transfer as a refund's original charge ([680d25a](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/680d25af021591f0ca4faaa46f74725e0056330d))
* find a refund's original charge in an older plan ([3348dd7](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/3348dd7559a63ebb96a455203238cb18876bc471))
* only match amazon payees as a refund's original charge ([58b3d7d](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/58b3d7d00f7fa738ca990d95f4602d80f763f802))
* only offer amazon charges as a refund's other candidate ([b20605c](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/b20605c480c59042a18b70625693ea1c717d4794))
* start the transaction cache afresh on a different amazon account ([1ad4b12](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/1ad4b120578c4a7fd6f2adfed6c2026dfa075431))
* trace a refund that equals one of the order's charges ([ae25419](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/ae254197b71bf09019d01699d5972aecf58882b2))
* write ynab dates in the refund panel the way people read them ([b4066e4](https://github.com/jacksonblankenship/ynab-amazon-tools/commit/b4066e411fd876c578cdde8917273891bdf70416))

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
