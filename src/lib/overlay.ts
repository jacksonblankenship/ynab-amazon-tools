// Full-page loading overlay, shown while a script works across pages. It lists the steps
// taken so far and survives page loads: its state is kept in sessionStorage and picked up
// again by the next page, which redraws it without replaying the entrance animation.
import { $, el } from "./dom.ts";
import { disclosure, reducedMotion, type Suite } from "./suite.ts";

/** How long a saved overlay stays resumable after the last update. */
const RESUME_MS = 120000;
const FADE_MS = 380;
const DOCK_MS = 620;

const ICONS =
  '<svg class="PFX-i-spin" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="#e2e3ff" stroke-width="4"/><circle class="PFX-arc" cx="24" cy="24" r="20" fill="none" stroke="#545bfe" stroke-width="4" stroke-linecap="round" stroke-dasharray="40 126"/></svg>' +
  '<svg class="PFX-i-check" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#545bfe"/><path d="M15 24.5l6 6 12-13" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
  '<svg class="PFX-i-stop" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f3eee2"/><path d="M24 14v13" stroke="#51504d" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="33.5" r="2.4" fill="#51504d"/></svg>';
const DOT =
  '<span class="PFX-ov-dot"><svg class="PFX-d-check" width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
  '<svg class="PFX-d-miss" width="10" height="10" viewBox="0 0 10 10"><path d="M3 3l4 4M7 3l-4 4" fill="none" stroke="#51504d" stroke-width="1.8" stroke-linecap="round"/></svg></span>';

interface Step {
  text: string;
  status: "active" | "done" | "miss";
}
interface State {
  title: string;
  found: boolean;
  steps: Step[];
  /** When it was last saved, for RESUME_MS. */
  at: number;
}

/** A way out offered when the overlay stops, e.g. one of several matching charges. */
export interface Choice {
  label: string;
  href?: string;
  /** Extra text filled in when it arrives (e.g. what the order contained). */
  detail?: Promise<string | null>;
  onPick?: () => void;
}

function isState(v: unknown): v is State {
  if (typeof v !== "object" || v === null) return false;
  const s: Partial<Record<keyof State, unknown>> = v;
  return (
    typeof s.title === "string" &&
    typeof s.found === "boolean" &&
    typeof s.at === "number" &&
    Array.isArray(s.steps) &&
    s.steps.every(
      (x: unknown) =>
        typeof x === "object" &&
        x !== null &&
        "text" in x &&
        typeof x.text === "string" &&
        "status" in x &&
        (x.status === "active" || x.status === "done" || x.status === "miss"),
    )
  );
}

export function makeOverlay(
  suite: Suite,
  opts: { timeoutMs?: number; onEnd?: () => void } = {},
) {
  const { timeoutMs = 30000, onEnd } = opts;
  const p = suite.prefix;
  const id = `${p}-overlay`;
  const key = `${p}-overlay`;
  const icons = ICONS.replace(/PFX-/g, `${p}-`);
  const dot = DOT.replace(/PFX-/g, `${p}-`);
  let state: State | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted whenever the overlay ends (stopped, done or cancelled), so work behind it can stop.
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
    } catch {
      /* ignore */
    }
  };
  const forget = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  const load = (): State | null => {
    try {
      const v: unknown = JSON.parse(sessionStorage.getItem(key) || "null");
      return isState(v) && Date.now() - v.at < RESUME_MS ? v : null;
    } catch {
      return null;
    }
  };
  const startTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () =>
        overlayStop(
          "This is taking longer than it should",
          `The connection may be slow, or ${suite.site} may have changed its pages. Close this and look manually.`,
        ),
      timeoutMs,
    );
  };

  /** The overlay's elements, built (or rebuilt from saved state) if they aren't on the page. */
  function parts() {
    let o = document.getElementById(id);
    const get = (c: string) => (o ? $<HTMLElement>(`.${p}-${c}`, o) : null);
    let card = get("ov-card");
    let icon = get("ov-icon");
    let msg = get("ov-msg");
    let sub = get("ov-sub");
    let steps = get("ov-steps");
    let extra = get("ov-extra");
    if (o && card && icon && msg && sub && steps && extra && state)
      return { o, card, icon, msg, sub, steps, extra, state };
    o?.remove(); // only if something else damaged it; rebuild from scratch
    const prev = state ?? load();
    state = prev ?? { title: "", found: false, steps: [], at: 0 };
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
    // Picked up from the previous page: appear as it was, not animate in again.
    if (prev) {
      card.classList.add(`${p}-static`);
      icon.classList.add(`${p}-static`);
    }
    if (state.found) o.classList.add(`${p}-found`);
    card.append(
      icon,
      msg,
      sub,
      steps,
      extra,
      el("div", `${p}-ov-foot`, disclosure(suite)),
    );
    o.append(el("div", `${p}-ov-backdrop`), card);
    (document.body || document.documentElement).appendChild(o);
    syncSteps(steps, state, true);
    extra.appendChild(cancelButton());
    startTimer();
    return { o, card, icon, msg, sub, steps, extra, state };
  }
  type Parts = ReturnType<typeof parts>;

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

  /** Bring the step list in line with `s`; `still` adds new steps without their animation. */
  function syncSteps(list: HTMLElement, s: State, still = false) {
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
  function setTitle(msg: HTMLElement, s: State, title: string) {
    if (s.title === title) return;
    s.title = title;
    msg.textContent = title;
    msg.classList.remove(`${p}-fade`);
    void msg.offsetWidth; // restart the fade animation
    msg.classList.add(`${p}-fade`);
  }
  function addStep(s: State, text: string) {
    const last = s.steps.at(-1);
    if (last?.text === text) return;
    if (last?.status === "active") last.status = "done";
    s.steps.push({ text, status: "active" });
  }
  /** Undo a stop, so a search that carries on shows as running again. */
  function resume(v: Parts) {
    if (!v.o.classList.contains(`${p}-stopped`)) return;
    v.o.classList.remove(`${p}-stopped`);
    v.sub.textContent = "";
    v.extra.replaceChildren(cancelButton());
    startTimer();
  }

  /** Show progress: a title, plus a step if it's a new one. */
  function overlay(title: string, step?: string) {
    const v = parts();
    resume(v);
    // Progress on one page (loading more rows) counts as progress, like a page load does.
    startTimer();
    setTitle(v.msg, v.state, title);
    if (step) addStep(v.state, step);
    syncSteps(v.steps, v.state);
    save();
  }
  /** At page start: carry on a saved overlay as it was, or open a new one. */
  function overlayStart(title: string, step?: string, found = false) {
    if (state ?? load()) {
      parts();
      return;
    }
    (found ? overlayFound : overlay)(title, step);
  }
  /** The thing searched for was found; what remains is showing it. */
  function overlayFound(title: string, step?: string) {
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
  /**
   * Stop and explain; the user closes it. `finished` marks the last step done (the search
   * ran to the end) rather than missed.
   */
  function overlayStop(
    title: string,
    sub = "",
    choices: Choice[] = [],
    { finished = false } = {},
  ) {
    const v = parts();
    clearTimeout(timer);
    const last = v.state.steps.at(-1);
    if (last?.status === "active") last.status = finished ? "done" : "miss";
    syncSteps(v.steps, v.state);
    v.o.classList.add(`${p}-stopped`);
    setTitle(v.msg, v.state, title);
    v.sub.textContent = sub;
    v.extra.replaceChildren(
      ...choices.map((c) => {
        const a = el("a", `${p}-choice`);
        a.textContent = c.label;
        a.href = c.href ?? "#";
        c.detail?.then((d) => {
          if (!d) return;
          a.appendChild(el("span", `${p}-choice-detail`)).textContent = d;
        });
        const pick = c.onPick;
        if (pick)
          a.addEventListener("click", (e) => {
            e.preventDefault();
            pick();
          });
        return a;
      }),
    );
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
  /**
   * Close the overlay. With a `target`, the card shrinks onto it (the result it found);
   * `landed` runs once the overlay is gone.
   */
  function overlayDone(target?: Element, landed?: () => void) {
    clearTimeout(timer);
    state = null;
    forget();
    end();
    const o = document.getElementById(id);
    const card = o && $<HTMLElement>(`.${p}-ov-card`, o);
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
    const box = (r: DOMRect) => ({
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    target.classList.add(`${p}-landing`);
    o.classList.add(`${p}-docking`);
    Object.assign(card.style, box(from));
    card.classList.add(`${p}-dock`);
    void card.offsetWidth; // start the transition from `from`
    Object.assign(card.style, box(to), { borderRadius: "14px", opacity: "0" });
    setTimeout(() => target.classList.add(`${p}-landed`), DOCK_MS / 2);
    setTimeout(() => {
      o.remove();
      target.classList.remove(`${p}-landing`, `${p}-landed`);
      landed?.();
    }, DOCK_MS);
  }
  /** Aborted when the current overlay ends; check it before acting on a slow result. */
  const signal = () => run.signal;

  return {
    overlay,
    overlayStart,
    overlayFound,
    overlayStop,
    overlayDone,
    signal,
  };
}
