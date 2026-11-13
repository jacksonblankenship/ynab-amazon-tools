// In-memory stand-in for the "$" module (vite-plugin-monkey's GM_* APIs). vitest.config.ts
// aliases "$" to this file, so source code under test talks to it unchanged. Tests drive
// and inspect it through `gm`; test/setup.ts calls gm.reset() before every test.
import type {
  GM_addValueChangeListener as AddListener,
  GM_getValue as GetValue,
  GM_registerMenuCommand as RegisterMenuCommand,
  GM_setValue as SetValue,
  GM_xmlhttpRequest as XmlhttpRequest,
} from "$";

type Listener = (name: string, oldValue?: unknown, newValue?: unknown, remote?: boolean) => void;

/** What a test's responder returns for a GM_xmlhttpRequest call. */
export type GmReply = { status: number; body?: unknown } | "error" | "timeout";

/** The parts of a GM_xmlhttpRequest call a test can assert on. */
export interface GmRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
}

// Tampermonkey stores values as JSON, so a stored value never aliases the caller's object.
const copy = (v: unknown): unknown => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const store = new Map<string, unknown>();
const listeners = new Map<string, Listener[]>();
const menu = new Map<string, () => void>();
const requests: GmRequest[] = [];
let responder: (req: GmRequest) => GmReply = () => "error";

function change(name: string, value: unknown, remote: boolean) {
  const old = store.get(name);
  store.set(name, copy(value));
  for (const l of listeners.get(name) ?? []) l(name, old, copy(value), remote);
}

export const gm = {
  /** Clear stored values, listeners, menu commands, requests and the responder. */
  reset() {
    store.clear();
    listeners.clear();
    menu.clear();
    requests.length = 0;
    responder = () => "error";
  },
  /** A stored value (a copy), or undefined. */
  get: (name: string): unknown => copy(store.get(name)),
  /** Seed a value without firing listeners, as if it was saved in an earlier session. */
  seed: (name: string, value: unknown) => void store.set(name, copy(value)),
  /** Set a value as another tab would: listeners fire with remote = true. */
  setRemote: (name: string, value: unknown) => change(name, value, true),
  /** Captions of the registered menu commands, in registration order. */
  menuCaptions: (): string[] => [...menu.keys()],
  /** Run a registered menu command by caption; throws if none is registered. */
  clickMenu(caption: string) {
    const run = menu.get(caption);
    if (!run) throw new Error(`No menu command "${caption}"`);
    run();
  },
  /** Every GM_xmlhttpRequest made since the last reset. */
  requests: (): readonly GmRequest[] => requests,
  /** Answer GM_xmlhttpRequest calls. Without one, every request fails with onerror. */
  respond(fn: (req: GmRequest) => GmReply) {
    responder = fn;
  },
};

export const GM_getValue = ((name: string, defaultValue?: unknown) =>
  store.has(name) ? copy(store.get(name)) : defaultValue) as typeof GetValue;

export const GM_setValue: typeof SetValue = (name, value) => change(name, value, false);

export const GM_addValueChangeListener: typeof AddListener = (name, callback) => {
  const list = listeners.get(name) ?? [];
  list.push(callback as Listener);
  listeners.set(name, list);
  return `${name}#${list.length}`;
};

export const GM_registerMenuCommand = ((caption: string, onClick: (e: MouseEvent) => void) => {
  menu.set(caption, () => onClick(new MouseEvent("click")));
  return caption;
}) as typeof RegisterMenuCommand;

// Answers asynchronously, as the real one does. Only the response fields the source reads
// are filled in.
export const GM_xmlhttpRequest = ((details) => {
  const req: GmRequest = {
    method: details.method ?? "GET",
    url: details.url,
    headers: { ...details.headers },
  };
  requests.push(req);
  const reply = responder(req);
  let aborted = false;
  queueMicrotask(() => {
    if (aborted) return;
    const base = {
      status: 0,
      statusText: "",
      responseText: "",
      response: "",
      responseHeaders: "",
      responseXML: null,
      readyState: 4 as const,
      finalUrl: details.url,
      context: details.context,
    };
    if (reply === "error") {
      const ev = { ...base, error: "stub error" } as never;
      details.onerror?.call(ev, ev);
    } else if (reply === "timeout") details.ontimeout?.();
    else {
      const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? null);
      const ev = { ...base, status: reply.status, responseText: text, response: text } as never;
      details.onload?.call(ev, ev);
    }
  });
  return { abort: () => void (aborted = true) };
}) as typeof XmlhttpRequest;
