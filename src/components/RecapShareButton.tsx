"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RECAP_MAX_WEEKS_BACK, recapFileName, shiftWeekKey } from "@/lib/weekly-recap";
import { weekKey } from "@/lib/xp";

type Audience = "student" | "staff";

const COPY = {
  student: {
    title: "Tổng kết tuần",
    loading: "Đang tạo ảnh…",
    error: "Không tạo được ảnh. Thử lại sau nhé.",
    share: "Chia sẻ",
    download: "Tải ảnh",
    previous: "Tuần trước",
    next: "Tuần sau",
    close: "Đóng",
    thisWeek: "Tuần này",
    weeksAgo: (weeks: number) => (weeks === 1 ? "Tuần trước" : `${weeks} tuần trước`),
  },
  staff: {
    title: "Weekly card",
    loading: "Rendering card…",
    error: "Could not render the card. Try again later.",
    share: "Share",
    download: "Download",
    previous: "Previous week",
    next: "Next week",
    close: "Close",
    thisWeek: "This week",
    weeksAgo: (weeks: number) => (weeks === 1 ? "Last week" : `${weeks} weeks ago`),
  },
} as const;

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

type CardState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; url: string; file: File };

function RecapShareSheet({
  userId,
  audience,
  onClose,
}: {
  userId?: string;
  audience: Audience;
  onClose: () => void;
}) {
  const copy = COPY[audience];
  const [currentWeek] = useState(() => weekKey(new Date()));
  const [week, setWeek] = useState(currentWeek);
  const requestKey = `${userId ?? ""}|${week}`;
  const [result, setResult] = useState<{ key: string; card: CardState } | null>(null);
  const card: CardState = result?.key === requestKey ? result.card : { status: "loading" };
  const oldestWeek = shiftWeekKey(currentWeek, -RECAP_MAX_WEEKS_BACK);
  const weeksAgo = Math.round(
    (Date.parse(currentWeek) - Date.parse(week)) / (7 * 86_400_000),
  );

  // Fetch the PNG up front so Share can open the share sheet straight from the
  // tap; iOS refuses navigator.share after an await outside the gesture.
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    const key = `${userId ?? ""}|${week}`;
    const params = new URLSearchParams({ week });
    if (userId) params.set("user", userId);
    fetch(`/api/recap-card?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        const file = new File([blob], recapFileName(week), { type: "image/png" });
        setResult({ key, card: { status: "ready", url, file } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, card: { status: "error" } });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [userId, week]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const shareFile = card.status === "ready" ? card.file : null;
  const canShareFile =
    shareFile != null &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [shareFile] });

  function download() {
    if (card.status !== "ready") return;
    const link = document.createElement("a");
    link.href = card.url;
    link.download = recapFileName(week);
    link.click();
  }

  async function share() {
    if (!shareFile) return;
    if (!canShareFile) {
      download();
      return;
    }
    try {
      await navigator.share({ files: [shareFile], title: "NaNu Academy" });
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") download();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      role="presentation"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recap-share-title"
        className="flex max-h-[100dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-[#fbfbfd] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:max-w-[460px] sm:rounded-[28px] sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="recap-share-title" className="text-[17px] font-bold tracking-tight text-[#1d1d1f]">
            {copy.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-[#1d1d1f] transition-colors hover:bg-black/[0.08]"
          >
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setWeek((current) => shiftWeekKey(current, -1))}
            disabled={week <= oldestWeek}
            aria-label={copy.previous}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#1d1d1f] transition-colors hover:bg-black/[0.05] disabled:opacity-30"
          >
            <MaterialIcon name="chevron_left" className="text-[24px]" />
          </button>
          <p className="text-[15px] font-semibold text-[#1d1d1f]">
            {weeksAgo === 0 ? copy.thisWeek : copy.weeksAgo(weeksAgo)}
          </p>
          <button
            type="button"
            onClick={() => setWeek((current) => shiftWeekKey(current, 1))}
            disabled={week >= currentWeek}
            aria-label={copy.next}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#1d1d1f] transition-colors hover:bg-black/[0.05] disabled:opacity-30"
          >
            <MaterialIcon name="chevron_right" className="text-[24px]" />
          </button>
        </div>

        <div className="relative mx-auto aspect-[4/5] w-full max-w-[min(100%,calc(58dvh*0.8))] overflow-hidden rounded-[20px] bg-[#e8f2fc] shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
          {card.status === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.url} alt={copy.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6 text-center text-[14px] font-medium text-[#86868b]">
              {card.status === "loading" ? copy.loading : copy.error}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void share()}
            disabled={card.status !== "ready"}
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[16px] bg-[#0071e3] text-[16px] font-semibold text-white transition-all hover:bg-[#0062c4] active:scale-[0.98] disabled:opacity-40"
          >
            <MaterialIcon name="ios_share" className="text-[20px]" />
            {canShareFile ? copy.share : copy.download}
          </button>
          {canShareFile ? (
            <button
              type="button"
              onClick={download}
              aria-label={copy.download}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] border border-black/[0.05] bg-white text-[#1d1d1f] shadow-sm transition-all hover:bg-[#f5f5f7] active:scale-[0.98]"
            >
              <MaterialIcon name="download" className="text-[22px]" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Opens the weekly recap card. Without `userId` it shows the signed-in learner's own card. */
export function RecapShareButton({
  userId,
  audience = "student",
  className,
  children,
}: {
  userId?: string;
  audience?: Audience;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open ? (
        <RecapShareSheet userId={userId} audience={audience} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
