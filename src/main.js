    var s = new Set();
    var _css = async (t) => {
        if (s.has(t)) return;
        s.add(t);
        ((c) => {
            if (typeof GM_addStyle === "function") GM_addStyle(c);
            else (document.head || document.documentElement).appendChild(document.createElement("style")).append(c);
        })(t);
    };
    _css("/*\n * The full order breakdown (a banner per delivery, a panel for the order), in the\n * suite's look. The button, overlay and single-charge panel come from src/lib/suite.css,\n * which also defines the acs-fadeup animation used here.\n */\n.acs-panel,\n.acs-banner {\n  box-sizing: border-box;\n  margin: 0 0 14px;\n  padding: 14px 20px;\n  background: #fff;\n  border: 1px solid #ece7da;\n  border-radius: 14px;\n  box-shadow:\n    0 1px 2px rgb(25 24 24 / 6%),\n    0 6px 20px rgb(25 24 24 / 7%);\n  font:\n    400 14px / 1.45 Figtree,\n    -apple-system,\n    \"Segoe UI\",\n    system-ui,\n    sans-serif;\n  color: #191818;\n  text-align: left;\n  animation: acs-fadeup 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n.acs-h {\n  margin-bottom: 4px;\n  font-size: 15px;\n  font-weight: 700;\n}\n.acs-amt {\n  font-weight: 700;\n  font-variant-numeric: tabular-nums;\n}\n.acs-muted {\n  color: #51504d;\n  font-size: 13px;\n}\n.acs-warn {\n  margin-top: 8px;\n  padding: 6px 10px;\n  border-radius: 8px;\n  background: #fdf3cf;\n  color: #6d5600;\n  font-size: 13px;\n}\n.acs-split {\n  margin-top: 8px;\n  padding-top: 8px;\n  border-top: 1px solid #f3eee2;\n}\n.acs-split table {\n  width: 100%;\n  margin: 4px 0 0;\n  border-collapse: collapse;\n  font-size: 14px;\n}\n.acs-split td {\n  padding: 2px 0;\n  border: 0;\n  vertical-align: top;\n}\n.acs-split td.acs-r {\n  padding-left: 12px;\n  text-align: right;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n.acs-split tr.acs-tot td {\n  padding-top: 6px;\n  border-top: 1px solid #f3eee2;\n  font-weight: 700;\n}\n.acs-list {\n  margin: 4px 0 0;\n  padding-left: 18px;\n}\n.acs-panel a {\n  /* biome-ignore lint/complexity/noImportantStyles: has to beat the host page's own link styles */\n  color: #475afa !important;\n}\n.acs-foot {\n  margin: 12px -20px -14px;\n  padding: 10px 20px;\n  border-top: 1px solid #f3eee2;\n  font-size: 11px;\n  color: #696763;\n}\n.acs-result .acs-split:first-child {\n  margin-top: 0;\n  padding-top: 0;\n  border-top: 0;\n}\n.acs-split tr.acs-hit td {\n  font-weight: 700;\n  color: #3a40d9;\n}\n.acs-put {\n  margin-top: 10px;\n  padding: 8px 12px;\n  border-radius: 10px;\n  background: #f0f0ff;\n  font-weight: 600;\n}\n.acs-token {\n  display: flex;\n  gap: 8px;\n  margin-top: 8px;\n}\n.acs-token input {\n  flex: 1;\n  min-width: 0;\n  padding: 6px 8px;\n  border: 1px solid #dbd7cc;\n  border-radius: 8px;\n  font: inherit;\n}\n.acs-token button {\n  padding: 6px 14px;\n  border: 0;\n  border-radius: 8px;\n  background: #545bfe;\n  color: #fff;\n  font: inherit;\n  font-weight: 600;\n  cursor: pointer;\n}\n");
    var ready = (fn) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn, { once: true }) : fn();
    var guard = (fail, fn) => () => {
        try {
            const r = fn();
            if (r) r.catch(fail);
        } catch (e) {
            fail(e);
        }
    };
    var errMsg = (e) => e instanceof Error && e.message ? e.message : String(e);
    function must(v, what) {
        if (v === void 0) throw new Error(`Internal error: missing ${what}`);
        return v;
    }
    function cents(s) {
        const m = String(s).replace(/,/g, "").match(/([-+−]?)\s*\$\s*(\d+(?:\.\d{1,2})?)/);
        const digits = m?.[2];
        if (!m || digits === void 0) return null;
        const v = Math.round(parseFloat(digits) * 100);
        return m[1] === "-" || m[1] === "−" ? -v : v;
    }
    var fmt = (c) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
    function allocateBy(total, things, weight) {
        const n = things.length;
        if (!n) return [];
        const sign = total < 0 ? -1 : 1;
        const T = Math.abs(total);
        let w = things.map((thing) => ({
            thing,
            x: Math.max(0, weight(thing))
        }));
        let W = w.reduce((a, b) => a + b.x, 0);
        if (W <= 0) {
            w = things.map((thing) => ({
                thing,
                x: 1
            }));
            W = n;
        }
        const cells = w.map(({ thing, x }) => {
            const raw = T * x / W;
            return {
                thing,
                v: Math.floor(raw),
                frac: raw - Math.floor(raw)
            };
        });
        const rem = T - cells.reduce((a, c) => a + c.v, 0);
        const order = [...cells].sort((a, b) => b.frac - a.frac);
        for (let k = 0; k < rem; k++) {
            const c = order[k % n];
            if (c) c.v++;
        }
        return cells.map((c) => [c.thing, c.v * sign]);
    }
    var suite_default = "/*\n * The suite's shared look: the YNAB button, the loading overlay and the result panel.\n * `pfx-` is replaced with the script's own prefix when suite-style.ts injects this, so\n * two scripts on one page never share a rule. Colors are YNAB's own; on YNAB the button\n * reads YNAB's theme variables, so it follows light and dark mode.\n */\n\n/* ---- YNAB button ---- */\n\n.pfx-yn {\n  position: fixed;\n  z-index: 99999;\n  display: none;\n  width: 26px;\n  height: 26px;\n  box-sizing: border-box;\n  border-radius: 50%;\n  align-items: center;\n  justify-content: center;\n  background: var(--actionPrimary, #545bfe);\n  color: var(--backgroundPrimary, #fff);\n  box-shadow:\n    0 1px 2px rgb(12 13 34 / 18%),\n    0 2px 6px rgb(84 91 254 / 28%);\n  cursor: pointer;\n  transition:\n    transform 160ms cubic-bezier(0.3, 1.4, 0.6, 1),\n    box-shadow 160ms ease,\n    background-color 160ms ease;\n}\n.pfx-yn:hover {\n  transform: scale(1.1);\n  box-shadow:\n    0 2px 4px rgb(12 13 34 / 18%),\n    0 6px 14px rgb(84 91 254 / 36%);\n}\n.pfx-yn:focus-visible {\n  outline: 2px solid var(--actionPrimary, #545bfe);\n  outline-offset: 2px;\n}\n.pfx-yn.pfx-pop {\n  animation: pfx-pop 200ms cubic-bezier(0.3, 1.5, 0.6, 1) both;\n}\n.pfx-yn.pfx-press {\n  transform: scale(0.88);\n}\n.pfx-yn.pfx-press::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  border-radius: 50%;\n  background: inherit;\n  pointer-events: none;\n  animation: pfx-ripple 520ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;\n}\n.pfx-yn-tip {\n  position: absolute;\n  right: calc(100% + 8px);\n  top: 50%;\n  transform: translate(4px, -50%);\n  padding: 4px 8px;\n  border-radius: 6px;\n  background: var(--labelPrimary, #191818);\n  color: var(--backgroundPrimary, #fff);\n  font:\n    600 12px / 1.3 Figtree,\n    Helvetica,\n    Arial,\n    sans-serif;\n  white-space: nowrap;\n  opacity: 0;\n  pointer-events: none;\n  transition:\n    opacity 140ms ease,\n    transform 140ms ease;\n}\n.pfx-yn:hover .pfx-yn-tip,\n.pfx-yn:focus-visible .pfx-yn-tip {\n  opacity: 1;\n  transform: translate(0, -50%);\n}\n\n/* ---- Loading overlay ---- */\n\n#pfx-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483647;\n  display: flex;\n  justify-content: center;\n  align-items: flex-start;\n  padding-top: 20vh;\n  box-sizing: border-box;\n  font:\n    400 14px / 1.45 Figtree,\n    -apple-system,\n    \"Segoe UI\",\n    system-ui,\n    sans-serif;\n  color: #191818;\n  text-align: left;\n  letter-spacing: normal;\n}\n.pfx-ov-backdrop {\n  position: absolute;\n  inset: 0;\n  background: rgb(248 246 242 / 94%);\n  backdrop-filter: blur(6px);\n  transition: opacity 380ms ease;\n}\n#pfx-overlay.pfx-out .pfx-ov-backdrop {\n  opacity: 0;\n}\n#pfx-overlay.pfx-out {\n  pointer-events: none;\n}\n.pfx-ov-card {\n  position: relative;\n  width: 400px;\n  max-width: calc(100vw - 32px);\n  box-sizing: border-box;\n  padding: 32px 32px 18px;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  background: #fff;\n  border: 1px solid #ece7da;\n  border-radius: 18px;\n  box-shadow:\n    0 2px 4px rgb(25 24 24 / 4%),\n    0 18px 48px rgb(25 24 24 / 12%);\n  animation: pfx-rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n.pfx-ov-card.pfx-static {\n  animation: none;\n}\n#pfx-overlay.pfx-out:not(.pfx-docking) .pfx-ov-card {\n  opacity: 0;\n  transform: translateY(6px);\n  transition:\n    opacity 260ms ease,\n    transform 260ms ease;\n}\n.pfx-ov-card.pfx-dock {\n  position: fixed;\n  margin: 0;\n  overflow: hidden;\n  animation: none;\n  transition:\n    top 560ms cubic-bezier(0.2, 0.8, 0.2, 1),\n    left 560ms cubic-bezier(0.2, 0.8, 0.2, 1),\n    width 560ms cubic-bezier(0.2, 0.8, 0.2, 1),\n    height 560ms cubic-bezier(0.2, 0.8, 0.2, 1),\n    border-radius 560ms ease,\n    opacity 200ms ease 380ms;\n}\n.pfx-ov-card.pfx-dock > * {\n  opacity: 0;\n  transition: opacity 160ms ease;\n}\n\n.pfx-ov-icon {\n  position: relative;\n  width: 48px;\n  height: 48px;\n  flex: none;\n}\n.pfx-ov-icon svg {\n  position: absolute;\n  inset: 0;\n  display: none;\n}\n.pfx-i-spin .pfx-arc {\n  transform-origin: 24px 24px;\n  animation: pfx-spin 900ms linear infinite;\n}\n.pfx-i-check circle,\n.pfx-i-stop {\n  transform-origin: 24px 24px;\n  animation: pfx-pop 260ms cubic-bezier(0.3, 1.5, 0.6, 1) both;\n}\n.pfx-i-check path {\n  stroke-dasharray: 26;\n  animation: pfx-draw 320ms cubic-bezier(0.6, 0, 0.4, 1) 120ms both;\n}\n.pfx-ov-icon .pfx-i-spin {\n  display: block;\n}\n#pfx-overlay.pfx-found .pfx-i-spin,\n#pfx-overlay.pfx-stopped .pfx-i-spin,\n#pfx-overlay.pfx-stopped .pfx-i-check {\n  display: none;\n}\n#pfx-overlay.pfx-found .pfx-i-check {\n  display: block;\n}\n#pfx-overlay.pfx-stopped .pfx-i-stop {\n  display: block;\n}\n.pfx-ov-icon.pfx-static .pfx-i-check circle,\n.pfx-ov-icon.pfx-static .pfx-i-check path {\n  animation: none;\n}\n\n.pfx-ov-msg {\n  margin-top: 16px;\n  font-size: 18px;\n  font-weight: 700;\n  line-height: 1.3;\n  text-align: center;\n  color: #191818;\n}\n.pfx-ov-sub {\n  margin-top: 6px;\n  font-size: 13px;\n  text-align: center;\n  color: #51504d;\n}\n.pfx-ov-sub:empty,\n.pfx-ov-steps:empty,\n.pfx-ov-extra:empty {\n  display: none;\n}\n.pfx-fade {\n  animation: pfx-fadeup 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n#pfx-overlay .pfx-ov-steps {\n  width: 100%;\n  margin: 18px 0 0;\n  padding: 0;\n  list-style: none;\n}\n#pfx-overlay .pfx-ov-step {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-height: 26px;\n  margin: 0;\n  padding: 0;\n  font-size: 13px;\n  color: #51504d;\n  animation: pfx-fadeup 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  transition: color 200ms ease;\n}\n#pfx-overlay .pfx-ov-step.pfx-static {\n  animation: none;\n}\n#pfx-overlay .pfx-ov-step.pfx-active {\n  color: #191818;\n}\n.pfx-ov-dot {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  box-sizing: border-box;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: background-color 200ms ease;\n}\n.pfx-ov-dot svg {\n  display: none;\n}\n.pfx-active .pfx-ov-dot {\n  width: 12px;\n  height: 12px;\n  margin: 2px;\n  border: 2px solid #e2e3ff;\n  border-top-color: #545bfe;\n  animation: pfx-spin 800ms linear infinite;\n}\n.pfx-done .pfx-ov-dot {\n  background: #545bfe;\n}\n.pfx-done .pfx-ov-dot .pfx-d-check,\n.pfx-miss .pfx-ov-dot .pfx-d-miss {\n  display: block;\n}\n.pfx-miss .pfx-ov-dot {\n  background: #f3eee2;\n}\n\n.pfx-ov-extra {\n  width: 100%;\n  margin-top: 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n#pfx-overlay a.pfx-choice {\n  display: block;\n  padding: 10px 14px;\n  border: 1px solid #dbd7cc;\n  border-radius: 10px;\n  background: #fff;\n  /* biome-ignore lint/complexity/noImportantStyles: has to beat the host page's own link styles */\n  color: #191818 !important;\n  /* biome-ignore lint/complexity/noImportantStyles: has to beat the host page's own link styles */\n  text-decoration: none !important;\n  font-size: 13px;\n  font-weight: 600;\n  transition:\n    border-color 140ms ease,\n    background-color 140ms ease;\n}\n#pfx-overlay a.pfx-choice:hover {\n  border-color: #545bfe;\n  background: #f0f0ff;\n}\n.pfx-choice-detail {\n  display: block;\n  margin-top: 2px;\n  font-weight: 400;\n  color: #51504d;\n}\n#pfx-overlay button.pfx-close {\n  align-self: center;\n  margin: 4px 0 0;\n  height: 36px;\n  padding: 0 18px;\n  border: 1px solid #dbd7cc;\n  border-radius: 999px;\n  background: #fff;\n  color: #191818;\n  font: inherit;\n  font-size: 13px;\n  font-weight: 600;\n  cursor: pointer;\n  transition:\n    background-color 140ms ease,\n    transform 140ms ease;\n}\n#pfx-overlay button.pfx-close:hover {\n  background: #f8f6f2;\n}\n#pfx-overlay button.pfx-close:active {\n  transform: scale(0.97);\n}\n.pfx-ov-foot {\n  margin-top: 22px;\n  font-size: 11px;\n  text-wrap: balance;\n  text-align: center;\n  color: #696763;\n}\n\n/* ---- Result panel ---- */\n\n.pfx-result {\n  box-sizing: border-box;\n  margin: 0 0 14px;\n  background: #fff;\n  border: 1px solid #ece7da;\n  border-radius: 14px;\n  box-shadow:\n    0 1px 2px rgb(25 24 24 / 6%),\n    0 6px 20px rgb(25 24 24 / 7%);\n  font:\n    400 14px / 1.45 Figtree,\n    -apple-system,\n    \"Segoe UI\",\n    system-ui,\n    sans-serif;\n  color: #191818;\n  text-align: left;\n  animation: pfx-fadeup 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  transition:\n    opacity 200ms ease,\n    transform 200ms ease;\n}\n.pfx-result.pfx-floating {\n  position: fixed;\n  top: 16px;\n  right: 16px;\n  z-index: 2147483646;\n  width: 360px;\n  max-width: calc(100vw - 32px);\n  margin: 0;\n}\n.pfx-result.pfx-landing {\n  opacity: 0;\n  animation: none;\n}\n.pfx-result.pfx-landing.pfx-landed {\n  opacity: 1;\n  transition: opacity 280ms ease;\n}\n.pfx-result.pfx-gone {\n  opacity: 0;\n  transform: translateY(-4px);\n}\n.pfx-r-head {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 12px 10px 0 20px;\n}\n.pfx-mark {\n  flex: none;\n  width: 22px;\n  height: 22px;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: #545bfe;\n  color: #fff;\n}\n.pfx-r-label {\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 0.07em;\n  text-transform: uppercase;\n  color: #696763;\n}\n.pfx-r-pill {\n  padding: 2px 8px;\n  border-radius: 999px;\n  background: #f3eee2;\n  color: #51504d;\n  font-size: 12px;\n  font-weight: 600;\n}\n.pfx-result button.pfx-r-x {\n  margin: 0 0 0 auto;\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  border: 0;\n  border-radius: 8px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: transparent;\n  color: #696763;\n  cursor: pointer;\n  transition: background-color 120ms ease;\n}\n.pfx-result button.pfx-r-x:hover {\n  background: #f3eee2;\n}\n.pfx-r-amt {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  column-gap: 12px;\n  padding: 2px 20px 0;\n}\n.pfx-r-num {\n  font-size: 30px;\n  font-weight: 700;\n  letter-spacing: -0.01em;\n  font-variant-numeric: tabular-nums;\n}\n.pfx-r-meta {\n  font-size: 13px;\n  color: #51504d;\n}\n.pfx-r-body {\n  padding: 8px 20px 0;\n}\n.pfx-r-body:empty {\n  display: none;\n}\n.pfx-r-foot {\n  margin-top: 12px;\n  padding: 10px 20px;\n  border-top: 1px solid #f3eee2;\n  font-size: 11px;\n  text-wrap: balance;\n  color: #696763;\n}\n\n/* The retailer's own element that the result is about. */\n/* Drawn just inside its edge (following its own corners), so a neighbouring box or a\n   clipping container on the retailer's page can't hide a side of it. */\n.pfx-glow {\n  outline: 2px solid #545bfe;\n  outline-offset: -2px;\n  animation: pfx-glow 1400ms ease-out 2;\n}\n\n@keyframes pfx-pop {\n  from {\n    opacity: 0;\n    transform: scale(0.5);\n  }\n  to {\n    opacity: 1;\n    transform: scale(1);\n  }\n}\n@keyframes pfx-ripple {\n  from {\n    transform: scale(1);\n    opacity: 0.55;\n  }\n  to {\n    transform: scale(3.4);\n    opacity: 0;\n  }\n}\n@keyframes pfx-rise {\n  from {\n    opacity: 0;\n    transform: translateY(10px) scale(0.98);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n@keyframes pfx-fadeup {\n  from {\n    opacity: 0;\n    transform: translateY(4px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n@keyframes pfx-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n@keyframes pfx-draw {\n  from {\n    stroke-dashoffset: 26;\n  }\n  to {\n    stroke-dashoffset: 0;\n  }\n}\n@keyframes pfx-glow {\n  from {\n    box-shadow: inset 0 0 0 0 rgb(84 91 254 / 35%);\n  }\n  to {\n    box-shadow: inset 0 0 0 14px rgb(84 91 254 / 0%);\n  }\n}\n\n/* Everything still changes state; nothing travels. */\n@media (prefers-reduced-motion: reduce) {\n  .pfx-yn,\n  .pfx-yn *,\n  .pfx-yn::after,\n  #pfx-overlay,\n  #pfx-overlay *,\n  .pfx-result,\n  .pfx-glow {\n    /* biome-ignore lint/complexity/noImportantStyles: overrides every animation above */\n    animation-duration: 1ms !important;\n    /* biome-ignore lint/complexity/noImportantStyles: overrides every animation above */\n    animation-iteration-count: 1 !important;\n    /* biome-ignore lint/complexity/noImportantStyles: overrides every transition above */\n    transition-duration: 1ms !important;\n  }\n}\n";
    var FONT = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap";
    function suiteStyle(prefix) {
        const root = document.head || document.documentElement;
        const style = document.createElement("style");
        style.textContent = suite_default.replace(/pfx-/g, `${prefix}-`);
        root.appendChild(style);
        if (location.hostname === "app.ynab.com") return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = FONT;
        root.appendChild(link);
    }
    var $ = (sel, root = document) => root.querySelector(sel);
    var $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    var txt = (el) => el ? el.textContent.replace(/\s+/g, " ").trim() : "";
    var el = (tag, cls, html) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    };
    var ESC = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
    };
    var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c] ?? c);
    var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function until(ok, ms, abort) {
        const end = Date.now() + ms;
        while (!ok()) {
            if (Date.now() > end || abort?.aborted) return false;
            await sleep(250);
        }
        return true;
    }
    function partitionsByLevel(xs) {
        const n = xs.length;
        const all = [];
        const rgs = new Array(n).fill(0);
        (function rec(i, max) {
            if (i === n) {
                all.push(Array.from({ length: max + 1 }, (_, g) => xs.filter((_x, k) => rgs[k] === g)));
                return;
            }
            for (let g = 0; g <= max + 1; g++) {
                rgs[i] = g;
                rec(i + 1, Math.max(max, g));
            }
        })(0, -1);
        return Array.from({ length: n }, (_, l) => all.filter((p) => p.length === n - l));
    }
    function solve(shipments, charges, credit) {
        const m = charges.length;
        const order = charges.map((c, j) => ({
            j,
            amount: c.amount
        })).sort((a, b) => b.amount - a.amount);
        const indexed = shipments.map((s, i) => ({
            s,
            i
        }));
        const levels = indexed.length <= 8 ? partitionsByLevel(indexed) : [[indexed.map((x) => [x])]];
        let budget = 3e6;
        const found = { best: null };
        for (const parts of levels) {
            for (const members of parts) {
                const slots = members.map((g, gi) => ({
                    gi,
                    group: {
                        members: g.map((x) => x.i),
                        total: g.reduce((s, x) => s + x.s.total, 0),
                        tol: 2 + g.reduce((s, x) => s + x.s.items.length, 0)
                    },
                    sig: g.map((x) => x.s.total).join("+"),
                    sum: 0,
                    count: 0
                }));
                const G = slots.map((w) => w.group);
                const picked = new Array(m).fill(null);
                const evaluate = (unmatched) => {
                    let score = unmatched * 1e3;
                    let err = 0, absorbed = 0, absorbing = 0;
                    const absorbedBy = new Array(G.length).fill(0);
                    for (const w of slots) {
                        if (w.count === 0) {
                            score += 1e3;
                            continue;
                        }
                        const r = w.group.total - w.sum;
                        if (Math.abs(r) <= w.group.tol) err += Math.abs(r);
                        else if (r > 0) {
                            absorbed += r;
                            absorbedBy[w.gi] = r;
                            absorbing++;
                        } else return;
                    }
                    const aErr = Math.abs(absorbed - credit);
                    if (aErr > 3 + 2 * absorbing) return;
                    score += err + aErr + absorbing * .5;
                    const sig = picked.map((w) => w ? w.sig : "x").join("|");
                    const best = found.best;
                    if (!best || score < best.score - 1e-9) found.best = {
                        score,
                        groups: G,
                        assign: picked.map((w) => w ? w.gi : -1),
                        absorbedBy,
                        sig,
                        ambiguous: false
                    };
                    else if (Math.abs(score - best.score) < 1e-9 && sig !== best.sig && best.groups === G) best.ambiguous = true;
                };
                const rec = (k, unmatched) => {
                    if (--budget < 0) return;
                    if (found.best && unmatched * 1e3 > found.best.score) return;
                    const next = order[k];
                    if (!next) {
                        evaluate(unmatched);
                        return;
                    }
                    const { j, amount: a } = next;
                    for (const w of slots) {
                        if (w.sum + a > w.group.total + w.group.tol) continue;
                        w.sum += a;
                        w.count++;
                        picked[j] = w;
                        rec(k + 1, unmatched);
                        w.sum -= a;
                        w.count--;
                    }
                    picked[j] = null;
                    rec(k + 1, unmatched + 1);
                };
                rec(0, 0);
                if (budget < 0) break;
            }
            if (found.best && found.best.score < 1e3 || budget < 0) break;
        }
        return {
            solution: found.best,
            incomplete: budget < 0
        };
    }
    function splitGroup(items, groupCharges, absorbed) {
        const toLines = (c, its) => allocateBy(c.amount, its, (i) => i.total).map(([item, amount]) => ({
            item,
            amount
        }));
        const [only, ...rest] = groupCharges;
        if (only && !rest.length) return [{
            charge: only,
            exact: true,
            lines: toLines(only, items)
        }];
        if (items.length <= 14) {
            const slots = groupCharges.map((charge) => ({
                charge,
                sum: 0,
                cnt: 0
            }));
            const pick = new Array(items.length);
            const search = (i) => {
                const item = items[i];
                if (!item) {
                    let usedCredit = absorbed === 0;
                    for (const s of slots) {
                        if (!s.cnt) return null;
                        const r = s.sum - s.charge.amount;
                        if (Math.abs(r) <= 1 + s.cnt) continue;
                        if (!usedCredit && Math.abs(r - absorbed) <= 2 + s.cnt) {
                            usedCredit = true;
                            continue;
                        }
                        return null;
                    }
                    return usedCredit ? pick.slice() : null;
                }
                for (const [c, s] of slots.entries()) {
                    pick[i] = c;
                    s.sum += item.total;
                    s.cnt++;
                    const hit = search(i + 1);
                    s.sum -= item.total;
                    s.cnt--;
                    if (hit) return hit;
                }
                return null;
            };
            const found = search(0);
            if (found) return groupCharges.map((c, ci) => ({
                charge: c,
                exact: true,
                lines: toLines(c, items.filter((_, i) => found[i] === ci))
            }));
        }
        return groupCharges.map((c) => ({
            charge: c,
            exact: false,
            lines: toLines(c, items)
        }));
    }
    var MONEY_RE = /[-+−]?\s*\$\s*[\d,]+\.\d{2}/g;
    var IS_MONEY = /^[-+−]?\s*\$\s*[\d,]+\.\d{2}$/;
    var ORDER_RE = /\d{3}-\d{7}-\d{7}/;
    // Amazon has written dates both as "November 2, 2026" and as "Nov 02, 2026".
    var DATE_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}$/;
    var STATUS_RE = /^(pending|completed|in progress|charged|refunded)$/i;
    // A card number's mask: "****1234" in one piece (old layout), or "••••" then "1234" (new layout).
    var MASK_RE = /[*•]{2,}/;
    var leaves = (root) => $$("*", root).filter((e) => !e.children.length && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName) && txt(e) && !e.closest("[aria-hidden=\"true\"]"));
    var moneyIn = (e) => e.textContent.match(MONEY_RE) || [];
    function parseOrder(doc) {
        const orderId = (txt($("[data-component=\"orderId\"]", doc)).match(/\d{3}-\d{7}-\d{7}/) || [])[0] || new URLSearchParams(location.search).get("orderID");
        let blocks = $$("[data-component=\"shipments\"] [data-component=\"purchasedItems\"]", doc);
        if (!blocks.length) blocks = $$("[data-component=\"purchasedItems\"]", doc);
        const shipments = blocks.map((pi, idx) => {
            let box = pi;
            while (box.parentElement && !box.querySelector("[data-component=\"shipmentStatus\"]")) box = box.parentElement;
            if ($$("[data-component=\"purchasedItems\"]", box).length > 1) box = pi;
            const status = txt($("[data-component=\"shipmentStatus\"]", box)).split(/(?<=\d)\s+(?=[A-Z])/)[0];
            let titles = $$("[data-component=\"itemTitle\"]", pi);
            if (!titles.length) titles = $$("a[href*=\"/dp/\"], a[href*=\"/gp/product/\"]", pi).filter((a) => txt(a) && !$("img", a));
            const items = titles.map((t) => {
                let root = t;
                while (root !== pi && !root.querySelector("[data-component=\"itemImage\"], img")) {
                    const up = root.parentElement;
                    if (!up) break;
                    root = up;
                }
                const priceBox = $("[data-component=\"unitPrice\"]", root);
                const price = cents(txt($(".a-offscreen", priceBox || root)) || moneyIn(priceBox || root)[0] || "") || 0;
                const qty = itemQty(root);
                return {
                    title: txt(t),
                    price,
                    qty,
                    ext: price * qty,
                    shipment: idx
                };
            });
            return {
                idx,
                box,
                status,
                items
            };
        });
        const summary = {
            subtotal: null,
            beforeTax: null,
            tax: 0,
            preTaxAdj: 0,
            credits: 0,
            grand: null,
            lines: []
        };
        for (const [label, val] of summaryRows(doc)) {
            summary.lines.push([label, val]);
            if (/grand total/i.test(label)) {
                summary.grand = val;
                break;
            } else if (/total before tax/i.test(label)) summary.beforeTax = val;
            else if (/subtotal/i.test(label)) summary.subtotal = val;
            else if (/tax/i.test(label)) summary.tax += val;
            else if (/points|gift card|reward/i.test(label)) summary.credits += -val;
            else if (/eligible|refund/i.test(label)) continue;
            else summary.preTaxAdj += val;
        }
        if (summary.beforeTax != null && summary.subtotal != null) summary.preTaxAdj = summary.beforeTax - summary.subtotal;
        return {
            orderId,
            shipments,
            summary
        };
    }
    function itemQty(root) {
        const pic = $("[data-component=\"itemImage\"]", root) || $("img", root)?.parentElement;
        const scope = pic?.closest("[data-component=\"itemImage\"]") ? pic : pic?.parentElement;
        const badge = scope && leaves(scope).map(txt).find((t) => /^\d{1,3}$/.test(t));
        if (badge) return +badge || 1;
        const field = txt($("[data-component=\"quantity\"]", root)).match(/\d+/);
        if (field) return +field[0] || 1;
        const n = txt(root).match(/\b(?:qty|quantity)\s*:?\s*(\d+)/i)?.[1];
        return n ? +n || 1 : 1;
    }
    function summaryRows(doc) {
        let box = $("[data-component=\"chargeSummary\"]", doc);
        if (!box) {
            box = leaves(doc.body || doc).find((e) => /grand total/i.test(txt(e)));
            while (box && !/subtotal/i.test(box.textContent)) box = box.parentElement;
        }
        const rows = [];
        let colonLabel = null;
        let lastText = null;
        for (const e of box ? leaves(box) : []) {
            const t = txt(e);
            if (IS_MONEY.test(t)) {
                const label = colonLabel || lastText;
                const val = cents(t);
                if (label && val != null) rows.push([label, val]);
                colonLabel = lastText = null;
            } else if (/:\s*$/.test(t)) colonLabel = t.replace(/:\s*$/, "");
            else lastText = t;
        }
        return rows;
    }
    function priceItems(order) {
        const items = order.shipments.flatMap((s) => s.items);
        const sumExt = items.reduce((a, i) => a + i.ext, 0);
        const s = order.summary;
        const warnings = [];
        const unpriced = items.filter((i) => !i.price).length;
        if (unpriced) warnings.push(`Couldn't read the price of ${unpriced} item${unpriced > 1 ? "s" : ""}. Amazon may have changed this page.`);
        if (s.subtotal == null || s.grand == null) warnings.push("Couldn't read the Order Summary, so tax and shipping aren't included in the estimates.");
        let scale = 1;
        if (s.subtotal != null && s.subtotal !== sumExt && s.subtotal > 0) {
            warnings.push(`Items on the page add to ${fmt(sumExt)} but the order subtotal is ${fmt(s.subtotal)} (cancelled or hidden items?). Estimates are scaled to the visible items.`);
            scale = sumExt / s.subtotal;
        }
        const adj = allocateBy(Math.round(s.preTaxAdj * scale), items, (i) => i.ext);
        const priced = allocateBy(Math.round(s.tax * scale), adj, ([i, a]) => i.ext + a).map(([[i, a], t]) => ({
            from: i,
            item: {
                ...i,
                total: i.ext + a + t
            }
        }));
        const shipments = order.shipments.map((sh) => {
            const its = sh.items.flatMap((i) => priced.filter((p) => p.from === i).map((p) => p.item));
            return {
                ...sh,
                items: its,
                total: its.reduce((a, i) => a + i.total, 0)
            };
        });
        return {
            order: {
                ...order,
                shipments
            },
            warnings
        };
    }
    var disclosure = (s) => `${s.name} for YNAB · independent, not affiliated with YNAB`;
    var searchIcon = (size) => `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>`;
    var reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var RESUME_MS = 12e4;
    var FADE_MS = 380;
    var DOCK_MS = 620;
    var ICONS = "<svg class=\"PFX-i-spin\" width=\"48\" height=\"48\" viewBox=\"0 0 48 48\"><circle cx=\"24\" cy=\"24\" r=\"20\" fill=\"none\" stroke=\"#e2e3ff\" stroke-width=\"4\"/><circle class=\"PFX-arc\" cx=\"24\" cy=\"24\" r=\"20\" fill=\"none\" stroke=\"#545bfe\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-dasharray=\"40 126\"/></svg><svg class=\"PFX-i-check\" width=\"48\" height=\"48\" viewBox=\"0 0 48 48\"><circle cx=\"24\" cy=\"24\" r=\"22\" fill=\"#545bfe\"/><path d=\"M15 24.5l6 6 12-13\" fill=\"none\" stroke=\"#fff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg><svg class=\"PFX-i-stop\" width=\"48\" height=\"48\" viewBox=\"0 0 48 48\"><circle cx=\"24\" cy=\"24\" r=\"22\" fill=\"#f3eee2\"/><path d=\"M24 14v13\" stroke=\"#51504d\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"24\" cy=\"33.5\" r=\"2.4\" fill=\"#51504d\"/></svg>";
    var DOT = "<span class=\"PFX-ov-dot\"><svg class=\"PFX-d-check\" width=\"10\" height=\"10\" viewBox=\"0 0 10 10\"><path d=\"M2 5.2l2 2 4-4.4\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg><svg class=\"PFX-d-miss\" width=\"10\" height=\"10\" viewBox=\"0 0 10 10\"><path d=\"M3 3l4 4M7 3l-4 4\" fill=\"none\" stroke=\"#51504d\" stroke-width=\"1.8\" stroke-linecap=\"round\"/></svg></span>";
    function isState(v) {
        if (typeof v !== "object" || v === null) return false;
        const s = v;
        return typeof s.title === "string" && typeof s.found === "boolean" && typeof s.at === "number" && Array.isArray(s.steps) && s.steps.every((x) => typeof x === "object" && x !== null && "text" in x && typeof x.text === "string" && "status" in x && (x.status === "active" || x.status === "done" || x.status === "miss"));
    }
    function makeOverlay(suite, opts = {}) {
        const { timeoutMs = 3e4, onEnd } = opts;
        const p = suite.prefix;
        const id = `${p}-overlay`;
        const key = `${p}-overlay`;
        const icons = ICONS.replace(/PFX-/g, `${p}-`);
        const dot = DOT.replace(/PFX-/g, `${p}-`);
        let state = null;
        let timer;
        let run = new AbortController();
        const end = () => {
            run.abort();
            run = new AbortController();
            onEnd?.();
        };
        const save = () => {
            if (!state) return;
            state.at = Date.now();
            try {
                sessionStorage.setItem(key, JSON.stringify(state));
            } catch {}
        };
        const forget = () => {
            try {
                sessionStorage.removeItem(key);
            } catch {}
        };
        const load = () => {
            try {
                const v = JSON.parse(sessionStorage.getItem(key) || "null");
                return isState(v) && Date.now() - v.at < RESUME_MS ? v : null;
            } catch {
                return null;
            }
        };
        const startTimer = () => {
            clearTimeout(timer);
            timer = setTimeout(() => overlayStop("This is taking longer than it should", `The connection may be slow, or ${suite.site} may have changed its pages. Close this and look manually.`), timeoutMs);
        };
        function parts() {
            let o = document.getElementById(id);
            const get = (c) => o ? $(`.${p}-${c}`, o) : null;
            let card = get("ov-card");
            let icon = get("ov-icon");
            let msg = get("ov-msg");
            let sub = get("ov-sub");
            let steps = get("ov-steps");
            let extra = get("ov-extra");
            if (o && card && icon && msg && sub && steps && extra && state) return {
                o,
                card,
                icon,
                msg,
                sub,
                steps,
                extra,
                state
            };
            o?.remove();
            const prev = state ?? load();
            state = prev ?? {
                title: "",
                found: false,
                steps: [],
                at: 0
            };
            o = el("div", null);
            o.id = id;
            o.setAttribute("role", "dialog");
            o.setAttribute("aria-label", suite.name);
            card = el("div", `${p}-ov-card`);
            icon = el("div", `${p}-ov-icon`, icons);
            msg = el("div", `${p}-ov-msg`);
            msg.setAttribute("aria-live", "polite");
            msg.textContent = state.title;
            sub = el("div", `${p}-ov-sub`);
            steps = el("ol", `${p}-ov-steps`);
            extra = el("div", `${p}-ov-extra`);
            if (prev) {
                card.classList.add(`${p}-static`);
                icon.classList.add(`${p}-static`);
            }
            if (state.found) o.classList.add(`${p}-found`);
            card.append(icon, msg, sub, steps, extra, el("div", `${p}-ov-foot`, disclosure(suite)));
            o.append(el("div", `${p}-ov-backdrop`), card);
            (document.body || document.documentElement).appendChild(o);
            syncSteps(steps, state, true);
            extra.appendChild(cancelButton());
            startTimer();
            return {
                o,
                card,
                icon,
                msg,
                sub,
                steps,
                extra,
                state
            };
        }
        function cancelButton() {
            const b = el("button", `${p}-close`, "Cancel");
            b.type = "button";
            b.addEventListener("click", () => {
                clearTimeout(timer);
                state = null;
                forget();
                end();
                document.getElementById(id)?.remove();
            });
            return b;
        }
        function syncSteps(list, s, still = false) {
            s.steps.forEach((step, i) => {
                let li = list.children[i];
                if (!li) {
                    li = el("li", null, dot);
                    li.appendChild(el("span", null)).textContent = step.text;
                    if (still) li.classList.add(`${p}-static`);
                    list.appendChild(li);
                }
                const keep = li.classList.contains(`${p}-static`) ? ` ${p}-static` : "";
                li.className = `${p}-ov-step ${p}-${step.status}${keep}`;
            });
        }
        function setTitle(msg, s, title) {
            if (s.title === title) return;
            s.title = title;
            msg.textContent = title;
            msg.classList.remove(`${p}-fade`);
            msg.offsetWidth;
            msg.classList.add(`${p}-fade`);
        }
        function addStep(s, text) {
            const last = s.steps.at(-1);
            if (last?.text === text) return;
            if (last?.status === "active") last.status = "done";
            s.steps.push({
                text,
                status: "active"
            });
        }
        function resume(v) {
            if (!v.o.classList.contains(`${p}-stopped`)) return;
            v.o.classList.remove(`${p}-stopped`);
            v.sub.textContent = "";
            v.extra.replaceChildren(cancelButton());
            startTimer();
        }
        function overlay(title, step) {
            const v = parts();
            resume(v);
            // Progress on one page (loading more rows) counts as progress, like a page load does.
            startTimer();
            setTitle(v.msg, v.state, title);
            if (step) addStep(v.state, step);
            syncSteps(v.steps, v.state);
            save();
        }
        function overlayStart(title, step, found = false) {
            if (state ?? load()) {
                parts();
                return;
            }
            (found ? overlayFound : overlay)(title, step);
        }
        function overlayFound(title, step) {
            const v = parts();
            resume(v);
            if (!v.state.found) {
                v.state.found = true;
                const last = v.state.steps.at(-1);
                if (last?.status === "active") last.status = "done";
                v.o.classList.add(`${p}-found`);
            }
            setTitle(v.msg, v.state, title);
            if (step) addStep(v.state, step);
            syncSteps(v.steps, v.state);
            save();
        }
        function overlayStop(title, sub = "", choices = [], { finished = false } = {}) {
            const v = parts();
            clearTimeout(timer);
            const last = v.state.steps.at(-1);
            if (last?.status === "active") last.status = finished ? "done" : "miss";
            syncSteps(v.steps, v.state);
            v.o.classList.add(`${p}-stopped`);
            setTitle(v.msg, v.state, title);
            v.sub.textContent = sub;
            v.extra.replaceChildren(...choices.map((c) => {
                const a = el("a", `${p}-choice`);
                a.textContent = c.label;
                a.href = c.href ?? "#";
                c.detail?.then((d) => {
                    if (!d) return;
                    a.appendChild(el("span", `${p}-choice-detail`)).textContent = d;
                });
                const pick = c.onPick;
                if (pick) a.addEventListener("click", (e) => {
                    e.preventDefault();
                    pick();
                });
                return a;
            }));
            const close = el("button", `${p}-close`, "Close");
            close.type = "button";
            close.addEventListener("click", () => {
                state = null;
                v.o.remove();
            });
            v.extra.appendChild(close);
            forget();
            end();
        }
        function overlayDone(target, landed) {
            clearTimeout(timer);
            state = null;
            forget();
            end();
            const o = document.getElementById(id);
            const card = o && $(`.${p}-ov-card`, o);
            if (!o) {
                landed?.();
                return;
            }
            o.classList.add(`${p}-out`);
            if (!target || !card || reducedMotion()) {
                setTimeout(() => {
                    o.remove();
                    landed?.();
                }, FADE_MS);
                return;
            }
            const from = card.getBoundingClientRect();
            const to = target.getBoundingClientRect();
            const box = (r) => ({
                top: `${r.top}px`,
                left: `${r.left}px`,
                width: `${r.width}px`,
                height: `${r.height}px`
            });
            target.classList.add(`${p}-landing`);
            o.classList.add(`${p}-docking`);
            Object.assign(card.style, box(from));
            card.classList.add(`${p}-dock`);
            card.offsetWidth;
            Object.assign(card.style, box(to), {
                borderRadius: "14px",
                opacity: "0"
            });
            setTimeout(() => target.classList.add(`${p}-landed`), DOCK_MS / 2);
            setTimeout(() => {
                o.remove();
                target.classList.remove(`${p}-landing`, `${p}-landed`);
                landed?.();
            }, DOCK_MS);
        }
        const signal = () => run.signal;
        return {
            overlay,
            overlayStart,
            overlayFound,
            overlayStop,
            overlayDone,
            signal
        };
    }
    var suite = {
        prefix: "acs",
        name: "Amazon Charge Finder",
        site: "Amazon"
    };
    var FIND_KEY = "acs-find";
    var { overlay, overlayStart, overlayFound, overlayStop, overlayDone, signal } = makeOverlay(suite, { onEnd: () => {
        try {
            sessionStorage.removeItem(FIND_KEY);
        } catch {}
    } });
    function resultPanel(suite, o) {
        const p = suite.prefix;
        const panel = el("section", `${p}-result${o.floating ? ` ${p}-floating` : ""}`);
        const label = o.label ?? "This charge";
        panel.setAttribute("aria-label", `${label}, from ${suite.name}`);
        const text = (cls, t) => {
            const e = el("span", `${p}-${cls}`);
            e.textContent = t;
            return e;
        };
        const head = el("div", `${p}-r-head`);
        head.append(el("span", `${p}-mark`, searchIcon(12)), text("r-label", label), text("r-pill", suite.site));
        const x = el("button", `${p}-r-x`, "<svg aria-hidden=\"true\" width=\"14\" height=\"14\" viewBox=\"0 0 14 14\"><path d=\"M3 3l8 8M11 3l-8 8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"/></svg>");
        x.type = "button";
        x.setAttribute("aria-label", "Dismiss");
        x.addEventListener("click", () => {
            panel.classList.add(`${p}-gone`);
            o.onDismiss?.();
            setTimeout(() => panel.remove(), 200);
        });
        head.appendChild(x);
        const amt = el("div", `${p}-r-amt`);
        amt.append(text("r-num", o.amount), text("r-meta", o.meta));
        const body = el("div", `${p}-r-body`);
        body.append(...o.body ?? []);
        panel.append(head, amt, body, el("div", `${p}-r-foot`, disclosure(suite)));
        return panel;
    }
    var short = (t) => t.length > 70 ? `${t.slice(0, 70).replace(/\s+\S*$/, "")}…` : t;
    var chargeLabel = (c) => `${fmt(c.amount)} on ${c.date || "unknown date"}${c.status && !/completed|charged|refunded/i.test(c.status) ? ` (${esc(c.status)})` : ""}`;
    function splitTable(split, multi) {
        const box = el("div", "acs-split");
        const head = el("div", null, `${multi ? `<b>${fmt(split.charge.amount)}</b> charge` : "Items"}${split.exact ? "" : " <span class=\"acs-muted\">(Amazon didn't say which items, so each item gets its share of this charge)</span>"}`);
        box.appendChild(head);
        const rows = split.lines.map((l) => `<tr><td>${esc(short(l.item.title))}${l.item.qty > 1 ? ` <span class="acs-muted">×${l.item.qty}</span>` : ""}</td><td class="acs-r">${fmt(l.amount)}</td></tr>`).join("");
        box.appendChild(el("table", null, `${rows}<tr class="acs-tot"><td>Total</td><td class="acs-r">${fmt(split.charge.amount)}</td></tr>`));
        return box;
    }
    function render(order, result) {
        const anchor = $("[data-component=\"shipments\"]");
        const anchorParent = anchor?.parentNode;
        if (!anchor || !anchorParent) throw new Error("Couldn't find where to show the results. Amazon may have changed this page.");
        $$(".acs-panel,.acs-banner,.acs-result").forEach((e) => {
            e.remove();
        });
        const { shipments } = order;
        const { charges, credits, refunds, solution, warnings, error } = result;
        const dn = (i) => `Delivery ${i + 1}`;
        const groupOfShipment = new Map();
        if (solution) solution.groups.forEach((g, gi) => {
            g.members.forEach((i) => {
                groupOfShipment.set(i, gi);
            });
        });
        shipments.forEach((sh, i) => {
            const b = el("div", "acs-banner");
            const gi = groupOfShipment.get(i);
            const groupCharges = solution && gi != null ? charges.filter((_, j) => solution.assign[j] === gi) : [];
            const est = `<span class="acs-muted">Estimated ${fmt(sh.total)} incl. tax</span>`;
            if (!solution || gi == null || !groupCharges.length) {
                b.appendChild(el("div", "acs-h", `${dn(i)}: no card charge matched`));
                b.appendChild(el("div", null, `${est}. ${charges.length ? "Not charged yet, or paid with points or a gift card." : ""}`));
                const fake = {
                    amount: sh.total,
                    date: ""
                };
                for (const split of splitGroup(sh.items, [fake], 0)) b.appendChild(splitTable(split, false));
            } else {
                const g = must(solution.groups[gi], `group ${gi}`);
                const others = g.members.filter((x) => x !== i);
                const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
                const [onlyCharge] = groupCharges;
                const head = onlyCharge && groupCharges.length === 1 ? `${dn(i)}: charged <span class="acs-amt">${fmt(onlyCharge.amount)}</span>` : `${dn(i)}: charged in ${groupCharges.length} parts, <span class="acs-amt">${groupCharges.map((c) => fmt(c.amount)).join(" + ")}</span>`;
                b.appendChild(el("div", "acs-h", head));
                b.appendChild(el("div", "acs-muted", groupCharges.map((c) => `${chargeLabel(c)} · ${esc(c.method)}`).join("<br>")));
                if (others.length) b.appendChild(el("div", "acs-warn", `Billed together with ${others.map(dn).join(" and ")}. The split below covers all of them.`));
                if (absorbed > 0) b.appendChild(el("div", "acs-muted", `${fmt(absorbed)} of this was paid with points or a gift card, so the card charge is lower than the items' price.`));
                if (others.length && i !== Math.min(...g.members)) b.appendChild(el("div", "acs-muted", `See ${dn(Math.min(...g.members))} for the split.`));
                else splitGroup(g.members.flatMap((x) => must(shipments[x], `delivery ${x + 1}`).items), groupCharges, absorbed).forEach((s) => {
                    b.appendChild(splitTable(s, groupCharges.length > 1));
                });
            }
            sh.box.insertBefore(b, sh.box.firstChild);
        });
        const p = el("div", "acs-panel");
        p.appendChild(el("div", "acs-h", "Charges on this order"));
        if (error) p.appendChild(el("div", "acs-warn", `Couldn't load the transactions page (${esc(error)}). Showing estimates only.`));
        if (charges.length) {
            const lis = charges.map((c, j) => {
                const g = solution?.assign[j] ?? -1;
                const to = g >= 0 ? must(solution?.groups[g], `group ${g}`).members.map(dn).join(" + ") : "<b>unmatched</b>";
                return `<li><b>${fmt(c.amount)}</b> · ${esc(c.date)} · ${esc(c.method)} → ${to}</li>`;
            });
            p.appendChild(el("ul", "acs-list", lis.join("")));
        } else if (!error) p.appendChild(el("div", null, "No card charges found for this order yet. Amazon charges when each delivery ships."));
        if (credits.length) p.appendChild(el("div", "acs-muted", `Also paid with: ${credits.map((c) => `${esc(c.method)} ${fmt(c.amount)}`).join(", ")}`));
        if (refunds.length) p.appendChild(el("div", "acs-muted", `Refunds: ${refunds.map((c) => `${fmt(c.amount)} on ${esc(c.date)} to ${esc(c.method)}`).join(", ")}`));
        if (solution?.ambiguous) warnings.push("More than one way to match these charges fits the totals. Double-check the deliveries with similar amounts.");
        warnings.forEach((w) => {
            p.appendChild(el("div", "acs-warn", esc(w)));
        });
        if (order.orderId) p.appendChild(el("div", "acs-muted", `<a href="/cpe/yourpayments/transactions?transactionTag=${encodeURIComponent(order.orderId)}">View transactions for this order</a>`));
        p.appendChild(el("div", "acs-foot", disclosure(suite)));
        anchorParent.insertBefore(p, anchor);
    }
    function renderFocus(order, charges, solution, focus, warnings = []) {
        const matched = charges.flatMap((c, j) => {
            const gi = solution.assign[j];
            return gi !== void 0 && gi >= 0 && c.amount === focus.amount ? [{
                c,
                gi
            }] : [];
        });
        const hit = matched.find((x) => x.c.date === focus.date) ?? matched[0];
        if (!hit) return null;
        const { c, gi } = hit;
        const g = must(solution.groups[gi], `group ${gi}`);
        const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
        const groupCharges = charges.filter((_, k) => solution.assign[k] === gi);
        const split = splitGroup(g.members.flatMap((x) => must(order.shipments[x], `delivery ${x + 1}`).items), groupCharges, absorbed).find((sp) => sp.charge === c);
        if (!split) return null;
        const boxes = g.members.map((x) => must(order.shipments[x], `delivery ${x + 1}`).box);
        const box = must(order.shipments[Math.min(...g.members)], `delivery ${Math.min(...g.members) + 1}`).box;
        $$(".acs-panel,.acs-banner,.acs-result").forEach((e) => {
            e.remove();
        });
        const dn = g.members.map((x) => `Delivery ${x + 1}`).join(" + ");
        const body = [];
        if (groupCharges.length > 1) body.push(el("div", "acs-muted", `Amazon billed this delivery in ${groupCharges.length} charges (${groupCharges.map((x) => fmt(x.amount)).join(" + ")}). This is the ${fmt(c.amount)} one.`));
        if (absorbed > 0) body.push(el("div", "acs-muted", `${fmt(absorbed)} of this delivery was paid with points or a gift card.`));
        body.push(splitTable(split, false));
        warnings.forEach((w) => {
            body.push(el("div", "acs-warn", esc(w)));
        });
        const panel = resultPanel(suite, {
            amount: fmt(c.amount),
            meta: `${c.date} · ${c.method} · ${dn}`,
            body,
            onDismiss: () => {
                for (const e of $$(".acs-glow")) e.classList.remove("acs-glow");
            }
        });
        box.insertBefore(panel, box.firstChild);
        panel.scrollIntoView?.({ block: "center" });
        return {
            panel,
            boxes
        };
    }
    async function fetchTransactions(orderId) {
        const url = `/cpe/yourpayments/transactions?transactionTag=${encodeURIComponent(orderId)}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`Transactions page returned ${res.status}`);
        const html = await res.text();
        const rows = parseTransactions(new DOMParser().parseFromString(html, "text/html"), orderId);
        if (!rows.length && html.includes(orderId)) throw new Error("Amazon's transactions page changed and couldn't be read");
        return rows;
    }
    // Reads transactions by what they say, not by how Amazon builds the page: a transaction
    // is the largest block around an "Order #" that holds exactly one dollar amount. Its date
    // and status are inside that block (new layout) or in the nearest heading above it (old
    // layout); a masked card number makes it a card charge.
    function transactionRows(root) {
        const orderLeaves = leaves(root).filter((e) => ORDER_RE.test(txt(e)) && !e.closest("#acs-overlay, .acs-result, .acs-panel"));
        const rows = [];
        for (const leaf of orderLeaves) {
            let row = leaf;
            while (row.parentElement && row.parentElement !== root && moneyIn(row.parentElement).length <= 1 && row.parentElement.textContent.length < 600) row = row.parentElement;
            if (moneyIn(row).length === 1 && !rows.includes(row)) rows.push(row);
        }
        return rows;
    }
    function cardIn(texts) {
        const i = texts.findIndex((t) => MASK_RE.test(t));
        const t = texts[i];
        if (t === void 0) return "";
        const [name = "", rest = ""] = t.split(MASK_RE);
        const digits = rest.match(/\d{2,4}/)?.[0] ?? texts[i + 1]?.match(/^\d{2,4}$/)?.[0];
        return digits ? `${name.trim() || texts[i - 1] || "Card"} ****${digits}` : "";
    }
    function parseTransactions(doc, orderId) {
        const root = doc.body || doc;
        const markers = leaves(root).filter((e) => DATE_RE.test(txt(e)) || STATUS_RE.test(txt(e)));
        const before = (row, re) => {
            let found = "";
            for (const m of markers) {
                if (!(m.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
                if (re.test(txt(m))) found = txt(m);
            }
            return found;
        };
        const out = [];
        for (const row of transactionRows(root)) {
            const texts = leaves(row).map(txt);
            // One charge can cover several orders; the row then lists each.
            const ids = [...new Set(texts.join(" ").match(new RegExp(ORDER_RE.source, "g")) || [])];
            if (orderId && !ids.includes(orderId)) continue;
            const amt = cents(must(moneyIn(row)[0], "amount"));
            if (!amt || !ids.length) continue;
            const card = cardIn(texts);
            const method = card || texts.find((t) => /points|gift card|balance|reward|credit/i.test(t)) || "";
            out.push({
                method,
                date: texts.find((t) => DATE_RE.test(t)) || before(row, DATE_RE),
                status: texts.find((t) => STATUS_RE.test(t)) || before(row, STATUS_RE),
                el: row,
                orderId: orderId || must(ids[0], "order id"),
                orderIds: ids,
                amount: Math.abs(amt),
                kind: amt > 0 ? "refund" : card ? "charge" : "credit"
            });
        }
        return out;
    }
    var card = (box) => {
        const c = box.closest(".a-box");
        return c && $$("[data-component=\"shipmentStatus\"]", c).length === 1 ? c : box;
    };
    async function orderPage() {
        if (!$("[data-component=\"shipments\"] [data-component=\"purchasedItems\"]")) {
            if (focusTarget()) overlayStop("Couldn't read this order page", "Amazon may have changed its layout.");
            return;
        }
        const focus = focusTarget();
        if (focus) overlayFound(`Found ${fmt(focus.amount)}`, "Finding the items it paid for");
        const { order, warnings } = priceItems(parseOrder(document));
        const search = signal();
        let txns = [];
        let error = null;
        if (order.orderId) try {
            txns = await fetchTransactions(order.orderId);
        } catch (e) {
            error = errMsg(e);
        }
        else error = "Couldn't find the order number on this page";
        if (focus && search.aborted) return;
        const charges = txns.filter((t) => t.kind === "charge");
        const credits = txns.filter((t) => t.kind === "credit");
        const refunds = txns.filter((t) => t.kind === "refund");
        const credit = credits.length ? credits.reduce((a, c) => a + c.amount, 0) : order.summary.credits;
        const { solution, incomplete } = charges.length ? solve(order.shipments, charges, credit) : {
            solution: null,
            incomplete: false
        };
        if (incomplete) warnings.push(solution ? "This order has too many charges to check every combination. The match below is the best found, not guaranteed. Double-check it against your statement." : "This order has too many charges to check every combination, so no match was found. Match the charges to deliveries manually.");
        else if (charges.length && (!solution || solution.assign.some((g) => g < 0))) warnings.push("Some charges didn't match a delivery cleanly (item-specific coupons or a partial refund can cause this). Unmatched amounts are flagged.");
        const shown = focus && solution && renderFocus(order, charges, solution, focus, warnings);
        if (shown) {
            const cards = shown.boxes.map(card);
            const top = Math.min(...cards.map((c) => c.getBoundingClientRect().top));
            if (Number.isFinite(top)) window.scrollTo({ top: window.scrollY + top - 16 });
            overlayDone(shown.panel, () => {
                for (const c of cards) c.classList.add("acs-glow");
            });
            return;
        }
        render(order, {
            charges,
            credits,
            refunds,
            solution,
            warnings,
            error
        });
        const sameRefunds = focus && !error ? refunds.filter((r) => r.amount === focus.amount) : [];
        const refund = sameRefunds.find((r) => r.date === focus?.date) ?? sameRefunds[0];
        if (refund) {
            const trace = traceRefund(order, charges, refund);
            const panel = refundPanel(trace);
            try {
                GM_setValue(TRACE_KEY, trace);
            } catch {}
            panel.scrollIntoView?.({ block: "center" });
            overlayDone(panel);
            return;
        }
        if (focus) overlayStop(error ? "Couldn't read Amazon's charges" : `Couldn't tie ${fmt(focus.amount)} to a delivery`, `${error ? `${error}. ` : ""}Showing the full breakdown for this order instead.`);
    }
    function focusTarget() {
        const h = new URLSearchParams(location.hash.slice(1));
        const amount = Number(h.get("acs-charge"));
        return amount ? {
            amount,
            date: h.get("acs-on") || ""
        } : null;
    }
    // ---- Refund tracing: refund → refunded items → the charge that paid for them → its YNAB category ----
    var TRACE_KEY = "acs-trace";
    var TOKEN_KEY = "ynab-token";
    var TRACE_MS = 6e5;
    var line = (cls, t) => {
        const e = el("div", cls);
        e.textContent = t;
        return e;
    };
    var itemNames = (set) => set.map((x) => `${x.title}${x.units > 1 ? ` ×${x.units}` : ""}`).join(", ");
    // Amazon doesn't say which items a refund was for, so find the item units whose
    // estimated price (with tax) adds up to it. Returns every fit, so the caller can tell
    // a sure answer from a guess.
    function refundedItems(order, amount) {
        const items = order.shipments.flatMap((sh) => sh.items);
        const pieces = items.flatMap((item, idx) => item.total > 0 ? Array.from({ length: Math.min(item.qty, 4) }, () => ({
            idx,
            v: Math.round(item.total / item.qty)
        })) : []);
        if (!pieces.length || pieces.length > 18) return [];
        const sets = new Map();
        const rec = (i, sum, picked) => {
            if (sets.size > 3) return;
            if (picked.length && Math.abs(sum - amount) <= 2 + picked.length) {
                const units = new Map();
                for (const p of picked) units.set(p.idx, (units.get(p.idx) ?? 0) + 1);
                const key = [...units].map(([k, n]) => `${k}x${n}`).sort().join(",");
                if (!sets.has(key)) sets.set(key, [...units].map(([k, n]) => ({
                    item: must(items[k], `item ${k}`),
                    units: n
                })));
            }
            const next = pieces[i];
            if (!next || sum > amount + 2 + picked.length) return;
            rec(i + 1, sum + next.v, [...picked, next]);
            rec(i + 1, sum, picked);
        };
        rec(0, 0, []);
        return sets.size > 3 ? [] : [...sets.values()];
    }
    // Every card charge on the order goes along, not just the one the item guess points at:
    // a wrong guess must never hide the charge the refund actually belongs to.
    function traceRefund(order, charges, refund) {
        const sets = refundedItems(order, refund.amount);
        return {
            at: Date.now(),
            orderId: order.orderId,
            refund: {
                amount: refund.amount,
                date: refund.date,
                method: refund.method
            },
            itemSets: sets.map((set) => set.map(({ item, units }) => ({
                title: short(item.title),
                units,
                amount: Math.round(item.total / item.qty) * units
            }))),
            charges: charges.map((c) => ({
                amount: c.amount,
                date: c.date,
                method: c.method
            }))
        };
    }
    // A hint only: Amazon doesn't say which items a refund was for.
    function refundHint(t) {
        const [only, ...more] = t.itemSets;
        return only && !more.length ? [line("acs-muted", `Probably for: ${itemNames(only)}`)] : [];
    }
    function refundPanel(t) {
        const body = [...refundHint(t)];
        if (t.charges.length) body.push(line("acs-muted", `This order's card charges: ${t.charges.map((c) => `${fmt(c.amount)} on ${c.date || "an unknown date"}`).join(", ")}.`), line("acs-put", "Switch back to your YNAB tab to see the categories they were in."));
        else body.push(line("acs-warn", "Amazon didn't show a card charge for this order, so there's no original charge to trace."));
        const panel = resultPanel(suite, {
            label: "This refund",
            amount: fmt(t.refund.amount),
            meta: [t.refund.date, t.refund.method].filter(Boolean).join(" · "),
            body
        });
        const anchor = $("[data-component=\"shipments\"]");
        const before = $(".acs-panel") ?? anchor;
        before?.parentNode?.insertBefore(panel, before);
        return panel;
    }
    var LONG = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC"
    });
    var NO_YEAR = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        timeZone: "UTC"
    });
    var parse = (iso) => {
        const t = Date.parse(`${iso}T00:00:00Z`);
        return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(t) ? t : null;
    };
    function readableDates(isos) {
        const ts = isos.flatMap((iso) => {
            const t = parse(iso);
            return t == null ? [] : [t];
        });
        if (ts.length !== isos.length) return isos.join(" or ");
        const [a, b] = ts;
        if (a === void 0) return "";
        if (b === void 0) return LONG.format(a);
        const year = (t) => new Date(t).getUTCFullYear();
        return `${(year(a) === year(b) ? NO_YEAR : LONG).format(a)} or ${LONG.format(b)}`;
    }
    var DAY = 864e5;
    var toDay = (s) => {
        const t = Date.parse(s);
        return Number.isNaN(t) ? null : Math.round(t / DAY);
    };
    function isFindQuery(v) {
        if (typeof v !== "object" || v === null) return false;
        const q = v;
        return typeof q.amount === "number" && Number.isFinite(q.amount) && typeof q.date === "string" && typeof q.kind === "string" && typeof q.pages === "number" && typeof q.started === "number";
    }
    async function orderContents(orderId) {
        try {
            const res = await fetch(`/your-orders/order-details?orderID=${encodeURIComponent(orderId)}`, { credentials: "include" });
            if (!res.ok) return null;
            const items = parseOrder(new DOMParser().parseFromString(await res.text(), "text/html")).shipments.flatMap((s) => s.items);
            const [first] = items;
            if (!first) return null;
            const title = first.title.length > 60 ? `${first.title.slice(0, 60).replace(/\s+\S*$/, "")}…` : first.title;
            const more = items.length - 1;
            return more ? `${title} and ${more} more item${more > 1 ? "s" : ""}` : title;
        } catch {
            return null;
        }
    }
    function nextPageButton() {
        const label = $$(".a-button-text, input[type=\"submit\"], button, a").find((e) => /next page/i.test(txt(e) || e.value || ""));
        if (label) {
            const inner = label.closest(".a-button-inner");
            return inner && $("input, button", inner) || label;
        }
        return $("input[name*=\"NextPage\"]");
    }
    // The new transactions page loads older rows as its list scrolls, inside its own
    // scrolling panel. Find that panel from a row (whatever it's called), scroll it to the
    // end, and wait for more rows. A wheel event isn't needed; setting the position is enough.
    async function loadMoreTransactions(rows, abort) {
        const last = rows.at(-1);
        if (!last) return "end";
        let box = last.parentElement;
        while (box && !(box.scrollHeight > box.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
        if (box) box.scrollTop = box.scrollHeight;
        else window.scrollTo(0, document.documentElement.scrollHeight);
        return settle(rows, abort);
    }
    // When Amazon refuses a load (usually a 429), the list ends in a visible "Something went
    // wrong" with a "Try again" button. The page always carries a hidden copy, so only a
    // visible one below the last row counts.
    function loadError(last) {
        return leaves(document.body).find((e) => /something went wrong|^try again$/i.test(txt(e)) && last.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING && e.getClientRects().length > 0);
    }
    async function settle(rows, abort) {
        const last = must(rows.at(-1), "last row");
        let failed = false;
        const done = await until(() => (failed = !!loadError(last)) || transactionRows(document.body).length > rows.length, 8e3, abort);
        return failed ? "failed" : done ? "more" : "end";
    }
    var MAX_PAGES = 25;
    // Amazon answers fast loading with 429s, so ask for more no faster than a person scrolls.
    var pace = () => sleep(1500 + Math.random() * 1e3);
    var THROTTLED = "Amazon may be limiting requests. Wait a few minutes and try again.";
    // ---- Amazon's transaction service, called directly ----
    // The page loads older transactions 20 at a time from this service, out of a small allowance
    // that answers 429 once spent. Asking it directly allows far bigger pages, and a refunds-only
    // list when the search is for a refund, so one request usually does what many scrolls did.
    // Every field the request needs is in the page's own startup data (__NEXT_DATA__).
    var API_PATH = "/payments-portal/data/iris/live/v1/data/manage/get-transactions";
    var API_PAGE = 100;
    var API_MAX = 10;
    var LOG_KEY = "acs-requests";
    // Asking again soon after a refusal can extend it, so hold off this long.
    var COOLDOWN_MS = 30 * 6e4;
    // Every request against the allowance is logged (in Tampermonkey's storage), so its real size shows up over time.
    function requestLog() {
        try {
            const v = GM_getValue(LOG_KEY, []);
            return Array.isArray(v) ? v : [];
        } catch {
            return [];
        }
    }
    function logRequest(how, status) {
        try {
            GM_setValue(LOG_KEY, [...requestLog(), {
                at: Date.now(),
                how,
                status
            }].slice(-300));
        } catch {}
    }
    function pageProps() {
        const s = document.getElementById("__NEXT_DATA__") ?? [...document.scripts].find((x) => !x.src && x.textContent.trimStart().startsWith("{\"props\""));
        try {
            return JSON.parse(s?.textContent ?? "null")?.props?.pageProps ?? null;
        } catch {
            return null;
        }
    }
    // The first value under a key matching `re`, however deep: the response's nesting is Amazon's to change.
    function findKey(v, re, depth = 0) {
        if (depth > 8 || !v || typeof v !== "object") return void 0;
        for (const [k, x] of Object.entries(v)) if (re.test(k)) return x;
        for (const x of Object.values(v)) {
            const f = findKey(x, re, depth + 1);
            if (f !== void 0) return f;
        }
        return void 0;
    }
    function apiRow(t) {
        const amt = cents(t.formattedAmount ?? "");
        const ids = [...new Set((t.orderData ?? []).flatMap((o) => `${o.orderDisplayString ?? ""} ${o.orderDetailsUrl ?? ""}`.match(new RegExp(ORDER_RE.source, "g")) ?? []))];
        if (!amt || !ids.length) return null;
        const pm = t.paymentMethodDisplayStringData ?? {};
        const digits = pm.paymentMethodNumber?.lastDigits;
        return {
            method: digits ? `${pm.paymentMethodName ?? "Card"} ****${digits}` : pm.paymentMethodName ?? "",
            date: t.formattedDate ?? "",
            status: t.statusInfo?.label ?? "",
            el: null,
            orderId: must(ids[0], "order id"),
            orderIds: ids,
            amount: Math.abs(amt),
            kind: amt > 0 ? "refund" : digits ? "charge" : "credit"
        };
    }
    function apiBody(props, cursor, refundsOnly) {
        const ctx = props.manageWalletRequest.requestContext;
        return {
            type: "GetTransactions",
            locale: ctx.localeInfo?.locale ?? "en_US",
            surfaceInfo: {
                clientApplicationType: "browser",
                surfaceFeatures: [],
                surfaceType: "desktop",
                userAgent: navigator.userAgent
            },
            requestTraceId: ctx.traceInfo?.requestId,
            applicationInstanceTraceId: props.request?.applicationInstanceTraceId,
            transactionsViewRequest: {
                pageSize: API_PAGE,
                filtersControls: { includeFilters: true },
                ...refundsOnly ? { dataControls: { filterItemInputs: [{
                    category: "TransactionType",
                    values: ["REFUND"]
                }] } } : {}
            },
            ...cursor ? { exclusiveStartKey: cursor } : {},
            widgetName: props.manageWalletRequest.tabName ?? "ViewTransactions"
        };
    }
    async function apiSearch(q, check, abort) {
        const props = pageProps();
        const token = props?.token;
        if (typeof token !== "string" || !props?.manageWalletRequest?.requestContext) return { unusable: true };
        const refundsOnly = q.kind === "refund";
        // A refunds-only list starts from the top; otherwise carry on below the rows the page came with.
        let cursor = refundsOnly ? void 0 : props.state?.transactionResponseState?.lastEvaluatedPageKey;
        if (!refundsOnly && !cursor) return {
            done: true,
            checked: 0
        };
        const seen = [];
        for (let n = 0; n < API_MAX; n++) {
            if (n) await pace();
            if (abort.aborted) return { aborted: true };
            overlay(`Finding ${fmt(q.amount)} on Amazon`, refundsOnly ? "Checking your refunds" : "Loading older transactions");
            let res;
            try {
                res = await fetch(API_PATH, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        "x-amzn-upx-token": token
                    },
                    body: JSON.stringify(apiBody(props, cursor, refundsOnly))
                });
            } catch (e) {
                // Never reached Amazon, so it costs nothing; the log still says why.
                logRequest("api", `not sent: ${errMsg(e)}`);
                return { unusable: true };
            }
            if (res.status === 429) {
                logRequest("api", 429);
                return {
                    throttled: true,
                    checked: seen.length
                };
            }
            const json = res.ok ? await res.json().catch(() => null) : null;
            const list = findKey(json, /^transactionList$/);
            logRequest("api", Array.isArray(list) ? res.status : `${res.status}, unreadable answer`);
            if (!Array.isArray(list)) return { unusable: true };
            seen.push(...list.map(apiRow).filter(Boolean));
            const { hits, past } = check(seen);
            if (hits.length) return { hits };
            if (past) return {
                done: true,
                past: true,
                checked: seen.length
            };
            cursor = findKey(json, /^lastEvaluated/);
            if (typeof cursor !== "string" || !cursor || findKey(json, /^hasMore$/) === false) return {
                done: true,
                checked: seen.length
            };
        }
        return {
            done: true,
            limit: true,
            checked: seen.length
        };
    }
    function requestLogPanel() {
        const log = requestLog();
        const now = Date.now();
        const within = (ms) => log.filter((e) => now - e.at < ms);
        const tally = (es) => `${es.filter((e) => e.status === 200).length} answered, ${es.filter((e) => e.status === 429).length} refused`;
        const time = (t) => new Date(t).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
        const refused = log.filter((e) => e.status === 429).at(-1);
        const rows = log.slice(-15).reverse().map((e) => `<tr><td>${esc(time(e.at))} <span class="acs-muted">${esc(e.how)}</span></td><td class="acs-r">${e.status === 429 ? "refused" : esc(e.status)}</td></tr>`).join("");
        const box = el("div", "acs-split");
        box.appendChild(el("table", null, rows || "<tr><td>Nothing yet.</td></tr>"));
        $$(".acs-result").forEach((e) => {
            e.remove();
        });
        document.body.appendChild(resultPanel(suite, {
            floating: true,
            label: "Amazon requests",
            amount: String(within(864e5).length),
            meta: "loads of older transactions in the last 24 hours",
            body: [line(null, `Last hour: ${tally(within(36e5))}. Last 24 hours: ${tally(within(864e5))}.`), line("acs-muted", refused ? `Last refusal: ${time(refused.at)}.` : "No refusals logged."), box]
        }));
    }
    async function transactionsPage() {
        let q = null;
        const h = new URLSearchParams(location.hash.slice(1));
        const find = h.get("acs-find");
        if (find) {
            if (!Number.isFinite(+find)) {
                history.replaceState(null, "", location.pathname + location.search);
                overlayStop("Couldn't read the charge from YNAB", "The link didn't include a valid amount. Close this and look manually.");
                return;
            }
            q = {
                amount: +find,
                date: h.get("acs-date") || "",
                kind: h.get("acs-kind") || "charge",
                pages: 0,
                started: Date.now()
            };
            history.replaceState(null, "", location.pathname + location.search);
        } else {
            try {
                const saved = JSON.parse(sessionStorage.getItem("acs-find") || "null");
                q = isFindQuery(saved) ? saved : null;
            } catch {
                q = null;
            }
            if (q && Date.now() - q.started > 3e5) q = null;
        }
        const save = (v) => {
            try {
                v ? sessionStorage.setItem(FIND_KEY, JSON.stringify(v)) : sessionStorage.removeItem(FIND_KEY);
            } catch {}
        };
        if (!q) {
            save(null);
            return;
        }
        const query = q;
        const search = signal();
        const dates = q.date ? q.date.split(",") : [];
        const targets = dates.map(toDay).filter((d) => d != null);
        const target = targets.length ? Math.min(...targets) : null;
        const distance = (day) => Math.min(...targets.map((t) => Math.abs(day - t)));
        const kindName = q.kind === "refund" ? "refund" : "charge";
        const findHits = (rows) => rows.filter((r) => r.amount === query.amount && r.kind === query.kind).flatMap((r) => r.orderIds.map((orderId) => ({
            ...r,
            orderId
        }))).map((r) => {
            const day = toDay(r.date);
            return {
                ...r,
                diff: targets.length && day != null ? distance(day) : 0
            };
        }).filter((r) => r.diff <= 14).sort((a, b) => a.diff - b.diff);
        const isPast = (rows) => {
            const days = rows.map((r) => toDay(r.date)).filter((d) => d != null);
            const oldest = days.length ? Math.min(...days) : null;
            return target != null && oldest != null && oldest < target - 14;
        };
        const stop = (title, sub, finished = false) => {
            save(null);
            overlayStop(title, sub, [], { finished });
        };
        const notFound = (why) => stop(`No ${fmt(query.amount)} ${kindName} found`, dates.length ? `${why} Amazon usually posts a charge a day before YNAB does, so this looked within two weeks of ${readableDates(dates)}.` : why, true);
        const refusedNow = (checked) => stop("Amazon is limiting how fast your transactions load", `It searched the ${checked} most recent transactions. Amazon's limit on loading older ones can last an hour or more, and trying again sooner can extend it.`);
        const open = (hits) => {
            const [closest] = hits;
            save(null);
            const orderUrl = (r) => `/your-orders/order-details?orderID=${r.orderId}#acs-charge=${r.amount}&acs-on=${encodeURIComponent(r.date)}`;
            const best = hits.filter((r) => r.diff === closest.diff && r.orderId);
            const orders = [...new Set(best.map((r) => r.orderId))];
            const [first] = best;
            if (orders.length === 1 && first) {
                overlayFound(`Found ${fmt(query.amount)}`, "Opening the order");
                location.replace(orderUrl(first));
                return;
            }
            overlayStop(`${best.length} ${kindName}s of ${fmt(query.amount)}`, "They're equally close to the YNAB date. Which one?", best.map((r, i) => ({
                label: `${r.date} · Order #${r.orderId}`,
                href: orderUrl(r),
                detail: sleep(i * 1e3).then(() => orderContents(r.orderId))
            })), { finished: true });
        };
        if (!await until(() => parseTransactions(document, null).length > 0, 8e3, search)) {
            if (search.aborted) return;
            stop("Amazon didn't show any transactions", THROTTLED);
            return;
        }
        let rows = parseTransactions(document, null);
        if (!rows.length && /order\s*#\s*\d{3}-\d{7}-\d{7}/i.test(document.body.textContent)) return stop("Couldn't read Amazon's transactions page", "Amazon may have changed its layout. Close this and look manually.");
        // Without dates the two-week window can't work, and any old charge of the same amount would match.
        if (rows.length && rows.every((r) => !toDay(r.date))) return stop("Couldn't read the dates on Amazon's transactions page", "Amazon may have changed its layout. Close this and look manually.");
        // 1. The rows that come with the page cost nothing.
        let hits = findHits(rows);
        if (hits.length) return open(hits);
        if (isPast(rows)) return notFound("Searched back past that date.");
        // Older rows cost requests from the allowance; don't spend one inside a recent refusal.
        const refusedAt = requestLog().filter((e) => e.status === 429).at(-1)?.at ?? 0;
        if (Date.now() - refusedAt < COOLDOWN_MS) {
            const again = new Date(refusedAt + COOLDOWN_MS).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            });
            return stop("Amazon is still limiting your transactions", `It refused a request ${Math.max(1, Math.round((Date.now() - refusedAt) / 6e4))} min ago, so only the ${rows.length} most recent were searched. Asking again too soon can extend the limit; try after ${again}.`);
        }
        // 2. Ask the transaction service directly.
        const api = await apiSearch(query, (seen) => ({
            hits: findHits(seen),
            past: isPast(seen)
        }), search);
        if (search.aborted || api.aborted) return;
        if (api.hits) return open(api.hits);
        if (api.throttled) return refusedNow(rows.length + api.checked);
        if (api.done) return notFound(api.past ? "Searched back past that date." : api.limit ? "Stopped before reaching that date." : "Reached the end of your transactions.");
        // 3. The service didn't answer the way it did when this was written: fall back to scrolling the page.
        let past = false;
        let stalled = false;
        for (;;) {
            if (search.aborted) return;
            rows = parseTransactions(document, null);
            hits = findHits(rows);
            if (hits.length) return open(hits);
            past = isPast(rows);
            if (past || query.pages >= MAX_PAGES) break;
            const next = nextPageButton();
            if (next) {
                query.pages++;
                save(query);
                overlay(`Finding ${fmt(query.amount)} on Amazon`, `Checking page ${query.pages + 1} of your transactions`);
                next.click();
                return;
            }
            query.pages++;
            overlay(`Finding ${fmt(query.amount)} on Amazon`, "Loading older transactions");
            await pace();
            if (search.aborted) return;
            // No retry: Amazon's limit lasts an hour or more, and asking again inside it only extends it.
            const got = await loadMoreTransactions(transactionRows(document.body), search);
            if (got !== "end") logRequest("scroll", got === "failed" ? 429 : 200);
            if (got === "failed") return refusedNow(transactionRows(document.body).length);
            if (got === "end") {
                stalled = true;
                break;
            }
        }
        if (search.aborted) return;
        // A list that stops growing is either the true end or a refused request; the page can't tell us which.
        notFound(past ? "Searched back past that date." : query.pages >= MAX_PAGES ? "Stopped before reaching that date." : stalled ? `Amazon stopped loading older transactions. That may be all of them, or ${THROTTLED.charAt(0).toLowerCase()}${THROTTLED.slice(1)}` : "Reached the end of your transactions.");
    }
    function ynabButton(opts) {
        const p = opts.prefix;
        const pill = el("a", `${p}-yn`, searchIcon(14));
        pill.appendChild(el("span", `${p}-yn-tip`)).textContent = opts.label;
        pill.setAttribute("aria-label", opts.label);
        pill.target = "_blank";
        pill.rel = "noopener";
        document.body.appendChild(pill);
        let current = null;
        let hideTimer;
        const show = (row) => {
            const payee = txt($(".ynab-grid-cell-payeeName", row));
            if (!opts.payee.test(payee)) return hide(0);
            const out = money($(".ynab-grid-cell-outflow", row));
            const inn = money($(".ynab-grid-cell-inflow", row));
            const amount = out || inn;
            if (!amount) return hide(0);
            pill.href = opts.href({
                amount,
                kind: out ? "charge" : "refund",
                dates: ynabDates(txt($(".ynab-grid-cell-date", row)))
            });
            const r = ($(".ynab-grid-cell-payeeName", row) || row).getBoundingClientRect();
            if (pill.style.display !== "flex") {
                pill.classList.remove(`${p}-pop`);
                pill.offsetWidth;
                pill.classList.add(`${p}-pop`);
            }
            pill.style.display = "flex";
            pill.style.top = `${r.top + (r.height - pill.offsetHeight) / 2}px`;
            pill.style.left = `${r.right - pill.offsetWidth - 6}px`;
            current = row;
            clearTimeout(hideTimer);
        };
        const hide = (delay = 250) => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                pill.style.display = "none";
                current = null;
            }, delay);
        };
        document.addEventListener("mouseover", (e) => {
            if (e.target instanceof Node && pill.contains(e.target)) {
                clearTimeout(hideTimer);
                return;
            }
            const row = e.target instanceof Element && e.target.closest(".ynab-grid-body-row");
            if (row) {
                if (row !== current) show(row);
                else clearTimeout(hideTimer);
            } else if (current) hide();
        }, true);
        document.addEventListener("scroll", () => hide(0), true);
        ["mousedown", "click"].forEach((t) => {
            pill.addEventListener(t, (e) => e.stopPropagation());
        });
        let pressTimer;
        pill.addEventListener("click", () => {
            clearTimeout(pressTimer);
            pill.classList.remove(`${p}-press`);
            pill.offsetWidth;
            pill.classList.add(`${p}-press`);
            pressTimer = setTimeout(() => pill.classList.remove(`${p}-press`), 520);
        });
    }
    var money = (cell) => {
        const v = txt(cell).replace(/[^\d.]/g, "");
        return v ? Math.round(parseFloat(v) * 100) : 0;
    };
    var iso = (y, mo, d) => `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    function ynabDates(s) {
        let m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
        if (m) {
            const [, y = "", mo = "", d = ""] = m;
            return [iso(y, mo, d)];
        }
        m = s.match(/(\d{1,2})\D(\d{1,2})\D(\d{4})/);
        if (!m) return [];
        const [, a = "", b = "", y = ""] = m;
        const order = Number(a) > 12 ? true : Number(b) > 12 ? false : dayFirst();
        if (order === true) return [iso(y, b, a)];
        if (order === false) return [iso(y, a, b)];
        return [iso(y, a, b), iso(y, b, a)];
    }
    function dayFirst() {
        for (const cell of $$(".ynab-grid-cell-date")) {
            const m = txt(cell).match(/^(\d{1,2})\D(\d{1,2})\D\d{4}$/);
            if (m && Number(m[1]) > 12) return true;
            if (m && Number(m[2]) > 12) return false;
        }
        return null;
    }
    var ynabPage = () => ynabButton({
        payee: /^(?!.*(web services|\baws\b)).*(amazon|amzn)/i,
        prefix: "acs",
        label: "Find on Amazon",
        href: (c) => `https://www.amazon.com/cpe/yourpayments/transactions#acs-find=${c.amount}&acs-date=${c.dates.join(",")}&acs-kind=${c.kind}`
    });
    function isTrace(v) {
        return typeof v === "object" && v !== null && typeof v.at === "number" && typeof v.refund?.amount === "number" && Array.isArray(v.charges) && Array.isArray(v.itemSets);
    }
    // The token lives in Tampermonkey's own storage (never the page's) and only goes to api.ynab.com.
    function ynabGet(path, token) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://api.ynab.com/v1${path}`,
                headers: { Authorization: `Bearer ${token}` },
                timeout: 2e4,
                onload: (r) => {
                    let body = null;
                    try {
                        body = JSON.parse(r.responseText);
                    } catch {}
                    resolve({
                        status: r.status,
                        body
                    });
                },
                onerror: () => reject(new Error("Couldn't reach YNAB.")),
                ontimeout: () => reject(new Error("YNAB took too long to answer."))
            });
        });
    }
    var ynabDay = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
    // YNAB usually dates a card charge a day or two after Amazon does.
    function findCharges(txns, c) {
        const day = toDay(c.date);
        const amazonish = (x) => /amazon|amzn/i.test(x.payee_name || "") ? 0 : 1;
        return txns.filter((x) => !x.deleted && x.amount === -c.amount * 10).map((x) => ({
            x,
            d: day == null ? 0 : ynabDay(x.date) - day
        })).filter((m) => m.d >= -3 && m.d <= 7).sort((a, b) => amazonish(a.x) - amazonish(b.x) || Math.abs(a.d) - Math.abs(b.d)).map((m) => m.x);
    }
    // The split line(s) of the original charge that hold the refunded items: a line whose
    // amount is one item's share, or all the refunded items' shares together.
    function refundLines(subs, t) {
        const shares = t.itemSets.flatMap((set) => [...set.map((x) => x.amount), set.reduce((a, x) => a + x.amount, 0)]);
        return subs.filter((s) => shares.some((v) => Math.abs(-s.amount / 10 - v) <= 3));
    }
    var realCategory = (n) => n && !/^(uncategorized|split)/i.test(n) ? n : "";
    // One original charge as a small table: its category, or each split line, with a link
    // to its account. A split line matching the refunded items' share is emphasized as a hint.
    function describeMatch(c, matches, t, plan) {
        const [x, alt] = matches;
        if (!x) return {
            nodes: [line("acs-warn", `No ${fmt(c.amount)} charge in YNAB within a week of ${c.date || "the Amazon date"}. It may be in another plan, or entered with a different amount.`)],
            cats: []
        };
        const subs = (x.subtransactions || []).filter((s) => !s.deleted);
        const lines = subs.length ? subs : [x];
        const hits = subs.length ? refundLines(subs, t) : [];
        const box = el("div", "acs-split");
        const account = plan && x.account_id ? `<a href="/${esc(plan)}/accounts/${esc(x.account_id)}">${esc(x.account_name || "account")}</a>` : esc(x.account_name || "");
        box.appendChild(el("div", null, `<b>${fmt(c.amount)}</b> on ${esc(x.date)} · ${account}${subs.length ? " · split" : ""}`));
        const rows = lines.map((s) => `<tr${hits.includes(s) ? " class=\"acs-hit\"" : ""}><td>${esc(realCategory(s.category_name) || "Uncategorized")}${s.memo ? ` <span class="acs-muted">${esc(short(s.memo))}</span>` : ""}</td><td class="acs-r">${fmt(-s.amount / 10)}</td></tr>`).join("");
        box.appendChild(el("table", null, rows));
        const nodes = [box];
        if (alt && alt.category_name !== x.category_name) nodes.push(line("acs-warn", `There's also a ${fmt(c.amount)} charge on ${alt.date} in ${alt.category_name || "no category"}. If that's the one, use it instead.`));
        return {
            nodes,
            cats: lines.map((s) => realCategory(s.category_name)).filter(Boolean)
        };
    }
    function categorySummary(cats, t) {
        const all = [...new Set(cats)];
        const [one] = all;
        if (!one) return [line("acs-warn", "None of these charges are categorized in YNAB yet.")];
        if (all.length === 1) return [line("acs-put", `Put ${fmt(t.refund.amount)} back in ${one}`)];
        return [line("acs-put", `This order was in: ${all.join(", ")}. The ${fmt(t.refund.amount)} belongs in one (or more) of these.`)];
    }
    function tokenForm(done) {
        const form = el("form", "acs-token");
        const input = el("input");
        input.type = "password";
        input.placeholder = "Paste a YNAB personal access token";
        input.autocomplete = "off";
        const save = el("button", null, "Save");
        save.type = "submit";
        form.append(input, save);
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const v = input.value.trim();
            if (!v) return;
            GM_setValue(TOKEN_KEY, v);
            done();
        });
        return [line(null, "To look up the category, this needs a YNAB personal access token. It's stored in Tampermonkey, not on the page, and only sent to api.ynab.com."), el("div", "acs-muted", "Create one under <a href=\"https://app.ynab.com/settings/developer\" target=\"_blank\" rel=\"noopener\">Developer Settings</a> in YNAB."), form];
    }
    async function fillTrace(body, t) {
        const say = (...nodes) => body.replaceChildren(...refundHint(t), ...nodes);
        if (!t.charges.length) return say(line("acs-warn", "Amazon didn't show a card charge for this order, so there's nothing to trace."));
        const token = GM_getValue(TOKEN_KEY, "");
        if (!token) return say(...tokenForm(() => fillTrace(body, t)));
        say(line("acs-muted", "Looking up the original charge in YNAB…"));
        const days = t.charges.map((c) => toDay(c.date)).filter((d) => d != null);
        const since = new Date(((days.length ? Math.min(...days) : Math.round(t.at / DAY) - 90) - 5) * DAY).toISOString().slice(0, 10);
        const plan = location.pathname.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
        let res;
        try {
            res = await ynabGet(`/plans/${plan ?? "last-used"}/transactions?since_date=${since}`, token);
        } catch (e) {
            return say(line("acs-warn", errMsg(e)));
        }
        if (res.status === 401) {
            GM_setValue(TOKEN_KEY, "");
            return say(line("acs-warn", "YNAB didn't accept the saved token."), ...tokenForm(() => fillTrace(body, t)));
        }
        if (res.status === 429) return say(line("acs-warn", "YNAB is limiting requests (it allows 200 an hour). Try again later."));
        const txns = res.body?.data?.transactions;
        if (res.status !== 200 || !Array.isArray(txns)) return say(line("acs-warn", `YNAB answered with an error (${res.status}).`));
        const found = t.charges.map((c) => describeMatch(c, findCharges(txns, c), t, plan));
        say(line("acs-muted", `The original order's ${found.length > 1 ? `${found.length} charges` : "charge"} in YNAB:`), ...found.flatMap((f) => f.nodes), ...categorySummary(found.flatMap((f) => f.cats), t));
    }
    function showTrace(t) {
        $$(".acs-result").forEach((e) => {
            e.remove();
        });
        GM_setValue(TRACE_KEY, {
            ...t,
            shown: true
        });
        const body = el("div", null);
        const panel = resultPanel(suite, {
            floating: true,
            label: "Refund",
            amount: fmt(t.refund.amount),
            meta: `Amazon order #${t.orderId}`,
            body: [body]
        });
        document.body.appendChild(panel);
        fillTrace(body, t).catch((e) => body.replaceChildren(line("acs-warn", errMsg(e))));
    }
    // The Amazon tab hands the trace over through Tampermonkey's storage; this YNAB tab shows it.
    function ynabTrace() {
        if (typeof GM_addValueChangeListener !== "function") return;
        GM_addValueChangeListener(TRACE_KEY, (_k, _old, t, remote) => {
            if (remote && isTrace(t) && !t.shown) showTrace(t);
        });
        const t = GM_getValue(TRACE_KEY, null);
        if (isTrace(t) && !t.shown && Date.now() - t.at < TRACE_MS) showTrace(t);
        GM_registerMenuCommand("Set YNAB token", () => {
            $$(".acs-result").forEach((e) => {
                e.remove();
            });
            const body = el("div", null);
            const panel = resultPanel(suite, {
                floating: true,
                label: "YNAB token",
                amount: "",
                meta: GM_getValue(TOKEN_KEY, "") ? "A token is saved. Saving a new one replaces it." : "No token saved yet.",
                body: [body]
            });
            body.replaceChildren(...tokenForm(() => body.replaceChildren(line("acs-put", "Saved. Refund traces will use it."))));
            document.body.appendChild(panel);
        });
        GM_registerMenuCommand("Forget YNAB token", () => GM_setValue(TOKEN_KEY, ""));
    }
    (() => {
        if (window.__acsLoaded) return;
        window.__acsLoaded = true;
        suiteStyle(suite.prefix);
        const fail = (e) => {
            console.error("[Amazon Charge Finder]", e);
            overlayStop("Something went wrong", errMsg(e));
        };
        const onTransactions = location.pathname.startsWith("/cpe/yourpayments/transactions");
        if (location.hostname !== "app.ynab.com") try {
            GM_registerMenuCommand("Amazon request log", () => ready(requestLogPanel));
        } catch {}
        if (location.hostname === "app.ynab.com") ready(guard(fail, () => {
            ynabPage();
            ynabTrace();
        }));
        else if (onTransactions) {
            let pending = /acs-find=/.test(location.hash);
            try {
                pending = pending || !!sessionStorage.getItem("acs-find");
            } catch {}
            if (pending) overlayStart("Finding your charge on Amazon", "Searching your transactions");
            ready(guard(fail, transactionsPage));
        } else {
            const f = focusTarget();
            if (f) overlayStart(`Found ${fmt(f.amount)}`, "Opening the order", true);
            ready(guard(fail, orderPage));
        }
    })();
