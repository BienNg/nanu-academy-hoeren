/**
 * Raised while the map tour is pending or running, so the daily quest intro
 * waits instead of covering it. Cleared when the tour finishes or is skipped.
 */

let active = false;
const listeners = new Set<() => void>();

export function setOnboardingActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
}

export function isOnboardingActive(): boolean {
  return active;
}

export function subscribeOnboardingGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
