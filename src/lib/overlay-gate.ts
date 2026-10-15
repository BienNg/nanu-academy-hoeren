/**
 * Full-screen sheets that open by themselves on Home (the daily quest intro,
 * the session rating) take turns: each one registers while it is up, and the
 * others wait until it closes. The first-run tour has its own gate
 * (onboarding-gate.ts) and goes before all of them.
 */

const open = new Set<string>();
const listeners = new Set<() => void>();
let snapshot = "";

export function setOverlayOpen(name: string, isOpen: boolean): void {
  if (open.has(name) === isOpen) return;
  if (isOpen) open.add(name);
  else open.delete(name);
  snapshot = [...open].sort().join(",");
  for (const listener of listeners) listener();
}

/** True while an overlay other than `name` is up. */
export function otherOverlayOpen(name: string): boolean {
  for (const entry of open) if (entry !== name) return true;
  return false;
}

/** Stable string for useSyncExternalStore: changes whenever an overlay opens or closes. */
export function overlaySnapshot(): string {
  return snapshot;
}

export function subscribeOverlays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
