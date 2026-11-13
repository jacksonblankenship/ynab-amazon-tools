// Driving pages that render client-side: the content a script needs arrives some time
// after load or after a scroll.

export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/** Resolve true once `ok()` holds, or false after `ms` ms or when `abort` fires. */
export async function until(
  ok: () => boolean,
  ms: number,
  abort?: AbortSignal,
): Promise<boolean> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end || abort?.aborted) return false;
    await sleep(250);
  }
  return true;
}
