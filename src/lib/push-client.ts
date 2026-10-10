const LATER_KEY = "nanu-push-later-until";
const LATER_MS = 7 * 24 * 60 * 60 * 1000;

export type PushEnableResult = "granted" | "denied" | "unsupported" | "failed";

function iosDevice(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function installedApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** True when the browser can still show the permission prompt. iPhone only after Add to Home Screen. */
export function canAskForStreakReminder(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return false;
  }
  if (Notification.permission !== "default") return false;
  if (iosDevice() && !installedApp()) return false;
  try {
    const until = Number(localStorage.getItem(LATER_KEY));
    if (Number.isFinite(until) && until > Date.now()) return false;
  } catch {
    return false;
  }
  return true;
}

export function dismissStreakReminderPrompt(): void {
  try {
    localStorage.setItem(LATER_KEY, String(Date.now() + LATER_MS));
  } catch {
    /* private mode */
  }
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

async function publicKey(): Promise<string | null> {
  const response = await fetch("/api/push");
  if (!response.ok) return null;
  const body = (await response.json()) as { publicKey?: unknown };
  return typeof body.publicKey === "string" && body.publicKey.length > 0 ? body.publicKey : null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function saveSubscription(subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON();
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return response.ok;
}

/** Ask for permission and store this browser. Call from a tap. */
export async function enableStreakReminders(): Promise<PushEnableResult> {
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const key = await publicKey();
    if (!key) return "failed";
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));
    return (await saveSubscription(subscription)) ? "granted" : "failed";
  } catch {
    return "failed";
  }
}

/** Keep a granted browser subscribed after the keys rotate or the app updates. */
export async function refreshPushSubscription(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const key = await publicKey();
    if (!key) return;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }
    await saveSubscription(subscription);
  } catch {
    /* the next visit tries again */
  }
}

/** Drop this browser's subscription. Safe while signed out: the endpoint itself is the secret. */
export async function releasePushSubscription(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  } catch {
    /* leave the browser subscription; the server copy expires on the next send */
  }
}
