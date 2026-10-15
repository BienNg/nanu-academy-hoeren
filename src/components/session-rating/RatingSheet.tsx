"use client";

import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChunkyButton } from "@/components/chunkyButton";
import { RatingPingu } from "@/components/session/Pingu";
import { FOCUS_RING } from "@/lib/keyboard";
import type { PendingRating } from "@/lib/session-rating-store";
import {
  RATING_COMMENT_MAX,
  RATING_LABELS,
  RATING_TAG_LABEL,
  ratingSubtitle,
  ratingTagsFor,
  ratingTitle,
  type RatingTag,
} from "@/lib/session-ratings";

/** How the sheet ended: sent or "Để sau" end it for good; a soft close leaves the Home card. */
export type RatingSheetExit = "done" | "soft";

const STAR_PATH = "M12 2.6l2.85 5.9 6.45.8-4.75 4.45 1.2 6.4L12 17l-5.75 3.15 1.2-6.4L2.7 9.3l6.45-.8z";
const THANKS_MS = 2000;
const SWIPE_CLOSE_PX = 100;

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function Star({ on, size }: { on: boolean; size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path
        d={STAR_PATH}
        fill={on ? "#FFC800" : "#E5E5EA"}
        stroke={on ? "#F0A800" : "#D1D1D6"}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarRow({ stars, size, onPick }: { stars: number; size: number; onPick: (value: number) => void }) {
  const box = size + 8;
  return (
    <div role="group" aria-label="Số sao" className="flex">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`${value} sao, ${RATING_LABELS[value]}`}
          aria-pressed={value === stars}
          onClick={() => onPick(value)}
          className={`flex items-center justify-center rounded-xl transition-transform active:scale-90 ${FOCUS_RING}`}
          style={{ width: Math.max(44, box), height: Math.max(44, box) }}
        >
          <Star on={value <= stars} size={size} />
        </button>
      ))}
    </div>
  );
}

/**
 * The session rating sheet (S1 stars, S2 details, S3 thanks). Focus stays
 * inside, Escape and the backdrop close it softly, and the handle can be
 * swiped down. Sending or "Để sau" ends it for this session.
 */
export function RatingSheet({
  pending,
  onExit,
}: {
  pending: PendingRating;
  onExit: (exit: RatingSheetExit) => void;
}) {
  const titleId = useId();
  const commentId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() === true;
  const drag = useDragControls();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<{ xp: number } | null>(null);
  const exit = useEffectEvent(onExit);
  const step = thanks ? "thanks" : stars === 0 ? "stars" : "details";

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exit(thanks ? "done" : "soft");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea") ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const inside = dialogRef.current?.contains(document.activeElement) ?? false;
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [thanks]);

  useEffect(() => {
    if (!thanks) return;
    const timer = window.setTimeout(() => exit("done"), THANKS_MS);
    return () => window.clearTimeout(timer);
  }, [thanks]);

  function pickStars(value: number) {
    // Tags belong to one star group, so crossing between 3 and 4 clears them.
    if ((value >= 4) !== (stars >= 4)) setTags([]);
    setStars(value);
    setError(null);
  }

  function toggleTag(tag: RatingTag) {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function later() {
    void fetch("/api/session-rating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classKey: pending.classKey, sessionDate: pending.day, dismiss: true }),
      keepalive: true,
    }).catch(() => {
      // Asked again on the next visit at worst.
    });
    onExit("done");
  }

  async function send() {
    if (sending || stars === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/session-rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classKey: pending.classKey, sessionDate: pending.day, stars, tags, comment }),
      });
      const data = (await response.json().catch(() => null)) as { xp?: unknown; denial?: unknown } | null;
      if (response.ok) {
        setThanks({ xp: typeof data?.xp === "number" ? data.xp : 0 });
        return;
      }
      // Already answered elsewhere, or the window just closed: nothing left to ask.
      if (data?.denial === "answered" || data?.denial === "closed") {
        onExit("done");
        return;
      }
      setError("Chưa gửi được. Thử lại nhé.");
    } catch {
      setError("Chưa gửi được. Kiểm tra mạng rồi thử lại nhé.");
    } finally {
      setSending(false);
    }
  }

  const high = stars >= 4;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45"
      role="presentation"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => onExit(thanks ? "done" : "soft")}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-t-[28px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
        style={{ fontFamily: "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif" }}
        initial={reduceMotion ? false : { y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag={reduceMotion ? false : "y"}
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.8 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > SWIPE_CLOSE_PX) onExit(thanks ? "done" : "soft");
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex h-6 cursor-grab touch-none items-center justify-center"
          onPointerDown={(event) => drag.start(event)}
          aria-hidden="true"
        >
          <span className="h-[5px] w-10 rounded-full bg-[#d1d1d6]" />
        </div>

        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <AnimatePresence mode="wait" initial={false}>
            {step === "stars" ? (
              <motion.div
                key="stars"
                className="flex flex-col items-center text-center"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              >
                <RatingPingu mood={0} size={124} />
                <h2 id={titleId} className="mt-2 text-[23px] font-extrabold leading-[30px] tracking-[-0.015em] text-[#1b1b1d]">
                  {ratingTitle(pending.day, localToday())}
                </h2>
                <p className="mt-1 font-[family-name:var(--font-be-vietnam-pro)] text-[15px] text-[#5e5e63]">
                  {ratingSubtitle(pending.lektion, pending.day)}
                </p>
                <div className="mt-5">
                  <StarRow stars={0} size={48} onPick={pickStars} />
                </div>
                <p className="mt-1 h-5 text-[14px] font-bold text-[#6e6e73]">Chạm vào một ngôi sao</p>
                <button
                  type="button"
                  onClick={later}
                  className={`mt-3 h-11 rounded-2xl px-5 text-[14px] font-extrabold uppercase tracking-[0.08em] text-[#0066cc] ${FOCUS_RING}`}
                >
                  Để sau
                </button>
              </motion.div>
            ) : null}

            {step === "details" ? (
              <motion.div
                key="details"
                className="flex flex-col"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              >
                <div className="flex items-center gap-3">
                  <RatingPingu mood={stars} size={68} />
                  <div className="flex flex-col">
                    <StarRow stars={stars} size={34} onPick={pickStars} />
                    <p className="pl-1.5 text-[15px] font-extrabold text-[#1b1b1d]" aria-live="polite">
                      {RATING_LABELS[stars]}
                    </p>
                  </div>
                </div>

                <h2 id={titleId} className="mt-4 mb-2.5 text-[19px] font-extrabold leading-[26px] text-[#1b1b1d]">
                  {high ? "Bạn thích điều gì nhất?" : "Điều gì chưa ổn?"}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {ratingTagsFor(stars).map((tag) => {
                    const on = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(tag)}
                        className={`flex h-10 items-center gap-1.5 rounded-full border-2 px-3.5 font-[family-name:var(--font-be-vietnam-pro)] text-[14px] ${FOCUS_RING} ${
                          on
                            ? "border-[#0066cc] bg-[#e8f2ff] font-semibold text-[#0059b5]"
                            : "border-[#e5e5ea] bg-white font-medium text-[#1b1b1d] shadow-[0_2px_0_#e5e5ea]"
                        }`}
                      >
                        {on ? (
                          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
                            <path d="m5 12 5 5 9-10" stroke="#0066cc" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                        {RATING_TAG_LABEL[tag]}
                      </button>
                    );
                  })}
                </div>

                <label htmlFor={commentId} className="mt-5 text-[14px] font-bold text-[#414753]">
                  Bạn muốn nói thêm gì không? <span className="font-medium text-[#6e6e73]">(không bắt buộc)</span>
                </label>
                <textarea
                  id={commentId}
                  value={comment}
                  maxLength={RATING_COMMENT_MAX}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Ví dụ: phần nghe hơi nhanh…"
                  rows={3}
                  className="mt-2 resize-none rounded-2xl border-2 border-[#e5e5ea] bg-[#f7f7f9] px-3.5 py-3 font-[family-name:var(--font-be-vietnam-pro)] text-[16px] leading-[22px] text-[#1b1b1d] outline-none focus:border-[#0066cc] focus:bg-white"
                />
                <p className="mt-1 self-end font-[family-name:var(--font-be-vietnam-pro)] text-[12px] text-[#6e6e73]">
                  {Array.from(comment).length}/{RATING_COMMENT_MAX}
                </p>

                {error ? (
                  <p role="alert" className="mt-1 text-center font-[family-name:var(--font-be-vietnam-pro)] text-[14px] font-semibold text-[#c4261d]">
                    {error}
                  </p>
                ) : null}

                <ChunkyButton className="mt-3 w-full" onClick={() => void send()} disabled={sending}>
                  {sending ? "Đang gửi…" : "Gửi đánh giá"}
                </ChunkyButton>
              </motion.div>
            ) : null}

            {step === "thanks" ? (
              <motion.div
                key="thanks"
                className="flex flex-col items-center pt-1 pb-2 text-center"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <RatingPingu mood={5} size={150} />
                <h2 id={titleId} className="mt-3 text-[28px] font-extrabold leading-9 tracking-[-0.02em] text-[#1b1b1d]">
                  Cảm ơn bạn!
                </h2>
                <p className="mt-1.5 max-w-[280px] font-[family-name:var(--font-be-vietnam-pro)] text-[15px] leading-[22px] text-[#5e5e63]">
                  Góp ý của bạn giúp các buổi học sau tốt hơn.
                </p>
                {thanks && thanks.xp > 0 ? (
                  <p className="mt-4 flex h-10 items-center gap-1.5 rounded-full border-2 border-[#ffd59a] bg-[#fff4e0] px-4 text-[16px] font-extrabold text-[#c25e00]">
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
                      <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="#FF9500" />
                    </svg>
                    +{thanks.xp} XP
                  </p>
                ) : null}
                <div className="mt-6 h-1 w-[120px] overflow-hidden rounded-full bg-[#f0edef]" aria-hidden="true">
                  <motion.div
                    className="h-full bg-[#c1c6d6]"
                    initial={{ width: reduceMotion ? "100%" : "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: THANKS_MS / 1000, ease: "linear" }}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
