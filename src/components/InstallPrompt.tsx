"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logPwaPrompt } from "@/lib/useProgress";

const DISMISS_KEY = "nanu-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "ios" | "ios-external" | "android" | "android-external";

function standalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function inAppBrowser(ua: string): boolean {
  return /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|Snapchat/i.test(
    ua,
  );
}

/** Phones and tablets only. A desktop browser, even a narrow window, stays a website. */
function installMode(): Mode | null {
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (!iOS && !android) return null;

  const inApp = inAppBrowser(ua);
  if (iOS) {
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua) && !inApp;
    return safari ? "ios" : "ios-external";
  }
  return inApp ? "android-external" : "android";
}

function ShareGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="inline-block align-[-3px]">
      <path
        fill="currentColor"
        d="M12 3.2 16.2 7.4 14.8 8.8 13 7v8.2h-2V7L9.2 8.8 7.8 7.4 12 3.2ZM6 11h2v8h8v-8h2v8.5c0 .8-.7 1.5-1.5 1.5h-9C6.7 21 6 20.3 6 19.5V11Z"
      />
    </svg>
  );
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode | null>(null);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [androidWaited, setAndroidWaited] = useState(false);

  useEffect(() => {
    if (standalone()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;

    const next = installMode();
    if (next) setMode(next);

    const onPrompt = (event: Event) => {
      if (!next || next === "android-external") return;
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setMode(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const waited = window.setTimeout(() => setAndroidWaited(true), 1500);
    return () => {
      window.clearTimeout(waited);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode || pathname.startsWith("/admin")) return null;
  if (mode === "android" && !promptEvent && !androidWaited) return null;

  function dismiss() {
    logPwaPrompt("later");
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
    setMode(null);
  }

  async function install() {
    if (!promptEvent) return;
    setInstalling(true);
    logPwaPrompt("install");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        logPwaPrompt("installed");
        setMode(null);
      } else {
        logPwaPrompt("cancelled");
      }
      setPromptEvent(null);
    } finally {
      setInstalling(false);
    }
  }

  const androidReady = mode === "android" && promptEvent;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-safe">
      <div className="mx-auto mb-3 flex max-w-lg items-start gap-3 rounded-2xl border-2 border-b-4 border-[#e5e5ea] bg-white p-3 shadow-[0_8px_24px_rgba(30,42,74,0.12)]">
        <AppMark size={48} fontFamily="var(--font-fredoka), sans-serif" />
        <div className="min-w-0 flex-1">
          <p className="font-label-md text-label-md font-bold text-on-surface">Cài NaNu Go</p>
          <p className="mt-0.5 text-[13px] leading-snug text-on-surface-variant">
            {mode === "ios" ? (
              <>
                Nhấn nút Chia sẻ <ShareGlyph /> rồi chọn &quot;Thêm vào Màn hình chính&quot;.
              </>
            ) : null}
            {mode === "ios-external" ? (
              <>Mở link này trong Safari, nhấn Chia sẻ, rồi chọn &quot;Thêm vào Màn hình chính&quot;.</>
            ) : null}
            {mode === "android-external" ? <>Mở link này trong Chrome, rồi chọn Cài đặt.</> : null}
            {mode === "android" && androidReady ? <>Thêm ứng dụng vào màn hình chính để học nhanh hơn.</> : null}
            {mode === "android" && !androidReady ? (
              <>Mở menu Chrome (⋮) và chọn &quot;Cài đặt ứng dụng&quot; hoặc &quot;Thêm vào màn hình chính&quot;.</>
            ) : null}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {androidReady ? (
              <button
                type="button"
                onClick={() => void install()}
                disabled={installing}
                className="rounded-xl bg-[#0071E3] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {installing ? "Đang cài…" : "Cài đặt"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl px-2 py-1.5 text-sm font-bold text-[#0071E3]"
            >
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
