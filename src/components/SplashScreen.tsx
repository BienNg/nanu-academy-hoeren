"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { SplashPingu } from "@/components/session/Pingu";

/** The inline script in the root layout reads the same key before the first paint. */
const SPLASH_SEEN_KEY = "nanu-splash";

/** Counted from the start of the page load, so a slow load doesn't add to it. */
const HOLD_MS = 1500;
const FADE_MS = 400;

let firstLaunch: boolean | undefined;

/** Read once per page load: Strict Mode runs effects twice, and the second run would see the flag. */
function isFirstLaunch(): boolean {
  if (firstLaunch === undefined) {
    try {
      firstLaunch = sessionStorage.getItem(SPLASH_SEEN_KEY) !== "1";
      sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      firstLaunch = false;
    }
  }
  return firstLaunch;
}

/**
 * Pingu on brand blue, like Duolingo's launch screen. Server-rendered so it covers
 * the page from the first paint; shows once per tab, then fades into the app.
 */
export function SplashScreen() {
  const [state, setState] = useState<"showing" | "leaving" | "gone">("showing");

  useEffect(() => {
    const first = isFirstLaunch();
    const timer = window.setTimeout(
      () => setState(first ? "leaving" : "gone"),
      first ? Math.max(0, HOLD_MS - performance.now()) : 0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (state !== "leaving") return;
    const timer = window.setTimeout(() => setState("gone"), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state === "gone") return null;

  return (
    <div
      className="pingu-splash fixed inset-0 z-[100] flex items-center justify-center bg-[#129BE0]"
      data-state={state}
      aria-hidden="true"
    >
      <div className="pingu-splash-content flex flex-col items-center gap-6 pb-[env(safe-area-inset-bottom,0px)] lg:gap-8">
        <div className="pingu-splash-pop">
          <SplashPingu className="w-[168px] sm:w-[192px] lg:w-[220px]" />
        </div>
        <div className="pingu-splash-rise">
          <Wordmark tone="onBlue" className="text-[44px] lg:text-[56px]" />
        </div>
      </div>
    </div>
  );
}
