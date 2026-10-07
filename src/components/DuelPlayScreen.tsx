"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { McCard } from "@/components/session/McCard";
import { ChillPingu } from "@/components/session/Pingu";
import { CountUp } from "@/components/QuestParts";
import { chunkyButton } from "@/components/chunkyButton";
import {
  DUEL_SIZE,
  MAX_ANSWER_CHARS,
  challengeLeftLabel,
  clipCanStart,
  completedAgoLabel,
  duelEndSteps,
  formatDuelTime,
  isSettledState,
  mergeDuelView,
  withClipSettled,
  type DuelClipView,
  type DuelEndStep,
  type DuelFeedback,
  type DuelView,
} from "@/lib/duels";
import { scoreAttempt } from "@/lib/scoring";
import { buildWordBank, checkOrder } from "@/lib/sentence-order";
import { checkMc } from "@/lib/multiple-choice";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";
import { useProgress } from "@/lib/useProgress";

const SPECIAL_CHARS = ["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"] as const;
const COUNTDOWN_MS = 3000;

let browserPlaySession = "";

function browserPlaySessionId(): string {
  if (!browserPlaySession) browserPlaySession = crypto.randomUUID();
  return browserPlaySession;
}

type Phase = "loading" | "countdown" | "play" | "between" | "result" | "review" | "error";

type Between = {
  kind: "forfeit";
  elapsedMs: number | null;
  hasNext: boolean;
};

function isViewPayload(value: unknown): value is { view: DuelView; feedback: DuelFeedback | null } {
  if (!value || typeof value !== "object") return false;
  const view = (value as { view?: DuelView }).view;
  return Boolean(view && Array.isArray(view.clips) && typeof view.id === "string");
}

function hasPending(view: DuelView): boolean {
  return view.clips.some((clip) => clip.you.state === "pending" || clip.you.state === "active");
}

function nextClip(view: DuelView): DuelClipView | null {
  return view.clips.find((clip) => clip.you.state === "pending" || clip.you.state === "active") ?? null;
}

function clipTime(state: DuelClipView["you"]["state"], elapsedMs: number | null): string {
  if (state === "forfeited") return "Bỏ";
  if (elapsedMs == null) return "—";
  return formatDuelTime(elapsedMs);
}

function clipNote(clip: DuelClipView): string | null {
  if (clip.winner === "you" || clip.winner === "opponent") return null;
  if (clip.you.elapsedMs == null && clip.opponent.elapsedMs == null) return "Cả hai bỏ";
  return "Hòa thời gian";
}

function opponentTime(clip: DuelClipView): string {
  if (clip.opponent.state === "hidden" || clip.opponent.state === "pending") return "Đang chờ";
  if (clip.opponent.state === "forfeited" || clip.opponent.elapsedMs == null) return "Bỏ";
  return formatDuelTime(clip.opponent.elapsedMs);
}

function completedWhen(view: DuelView): string | null {
  if (!view.complete || !view.completedAt) return null;
  return completedAgoLabel(view.completedAt);
}

function WinnerCrown({ visible }: { visible: boolean }) {
  return (
    <span
      className={`mb-1 flex h-4 items-end justify-center ${visible ? "text-[#f5b400]" : "invisible"}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 16" className="h-4 w-6" fill="currentColor">
        <path d="M2 14h20L20.2 6.2 16 9.4 12 2.4 8 9.4 3.8 6.2 2 14z" />
        <circle cx="3.6" cy="5.2" r="1.5" />
        <circle cx="12" cy="2.2" r="1.5" />
        <circle cx="20.4" cy="5.2" r="1.5" />
      </svg>
    </span>
  );
}

const END_TILE =
  "flex flex-col items-center gap-1 rounded-[20px] border border-black/[0.04] bg-white px-2 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]";

function ScoreSide({ name, points, winner }: { name: string; points: number; winner: boolean }) {
  return (
    <div className="min-w-0 text-center">
      <WinnerCrown visible={winner} />
      <p className="truncate text-[11px] font-bold uppercase tracking-wider text-[#86868b]">{name}</p>
      <p
        className={`mt-1 text-[26px] font-bold leading-none tabular-nums tracking-tight ${
          winner ? "text-[#0284c7]" : "text-[#1d1d1f]"
        }`}
      >
        {points}
      </p>
    </div>
  );
}

/** One beat after your last clip, laid out like the lesson end card. */
export function DuelEndCard({
  step,
  view,
  primaryLabel,
  onPrimary,
  primaryBusy = false,
  secondaryLabel,
  onSecondary,
}: {
  step: DuelEndStep;
  view: DuelView;
  primaryLabel: string;
  onPrimary: () => void;
  primaryBusy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const rise = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.25 },
        };
  const won = view.yourOutcome === "win";
  const lost = view.yourOutcome === "loss";

  return (
    <section className="fixed inset-0 z-10 flex flex-col bg-[#faf8ff]" aria-live="polite">
      <div className="min-h-0 flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+3.5rem)]">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-6 py-4 text-center">
          <motion.div
            className="flex h-[170px] items-end justify-center"
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 22 }}
          >
            <div className="origin-bottom scale-[1.9]" aria-hidden="true">
              <ChillPingu pose={step.pose} />
            </div>
          </motion.div>

          <motion.p
            className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-[#86868b]"
            {...rise(0.15)}
          >
            Đấu với {view.opponentName}
          </motion.p>
          <motion.h2
            className="mt-2 text-[34px] font-bold leading-[1.2] tracking-tight text-[#1d1d1f] sm:text-[40px]"
            style={{ letterSpacing: "-0.03em" }}
            {...rise(0.25)}
          >
            {step.title}
          </motion.h2>
          <motion.p className="mt-2 text-[17px] font-medium text-[#86868b]" {...rise(0.35)}>
            {step.subtitle}
          </motion.p>

          {step.xp != null ? (
            <motion.div
              className="mt-4 inline-flex items-center gap-1 text-[28px] font-extrabold leading-none text-[#f59e0b]"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 16, delay: 0.5 }
              }
            >
              <span
                className="material-symbols-outlined text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                bolt
              </span>
              +<CountUp from={0} to={step.xp} delay={0.7} duration={0.8} />
              {" XP"}
            </motion.div>
          ) : null}

          {step.score ? (
            <motion.div className={`${END_TILE} mt-5 w-full`} {...rise(0.6)}>
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
                <ScoreSide name={view.yourName} points={view.yourPoints} winner={won} />
                <span className="pt-4 text-[12px] font-extrabold tracking-wide text-[#94a3b8]">VS</span>
                <ScoreSide name={view.opponentName} points={view.opponentPoints} winner={lost} />
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>
      <div className="relative z-20 mx-auto w-full max-w-md shrink-0 bg-[#faf8ff] px-6 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <motion.button
          type="button"
          onClick={onPrimary}
          disabled={primaryBusy}
          className={chunkyButton(primaryBusy ? "disabled" : "primary", "w-full")}
          {...rise(0.8)}
        >
          {primaryLabel}
        </motion.button>
        {secondaryLabel && onSecondary ? (
          <motion.button
            type="button"
            onClick={onSecondary}
            className={chunkyButton("secondary", "mt-3 w-full")}
            {...rise(0.8)}
          >
            {secondaryLabel}
          </motion.button>
        ) : null}
      </div>
    </section>
  );
}

function countdownLabel(seconds: number): string {
  if (seconds >= 3) return "Sẵn sàng?";
  if (seconds === 2) return "Tập trung";
  return "Nghe nào!";
}

function Hint({ feedback }: { feedback: DuelFeedback }) {
  const scriptWords = feedback.words.filter((word) => word.status !== "extra");
  const firstMistake = scriptWords.findIndex(
    (word) => word.status === "incorrect" || word.status === "missing",
  );
  return (
    <p className="text-[16px] font-semibold leading-relaxed text-[#131b2e]">
      {scriptWords.map((word, index) => {
        if (firstMistake === -1) return <span key={index}>{word.word} </span>;
        if (index < firstMistake) return <span key={index}>{word.word} </span>;
        if (index === firstMistake) {
          return (
            <strong key={index} className="text-[#be123c] underline decoration-[#be123c] underline-offset-4">
              {word.word}{" "}
            </strong>
          );
        }
        return (
          <span key={index} className="tracking-wide text-[#94a3b8]">
            {"*".repeat(Array.from(word.word).length)}{" "}
          </span>
        );
      })}
    </p>
  );
}

const countdownStarts = new Map<string, number>();

export function OpeningCountdown({
  duelId,
  opponentName,
  onDone,
}: {
  duelId: string;
  opponentName: string;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });
  const [left, setLeft] = useState(3);

  useEffect(() => {
    const started = countdownStarts.get(duelId) ?? Date.now();
    countdownStarts.set(duelId, started);
    let finished = false;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      if (elapsed >= COUNTDOWN_MS) {
        if (finished) return;
        finished = true;
        window.clearInterval(timer);
        countdownStarts.delete(duelId);
        onDoneRef.current();
        return;
      }
      setLeft(3 - Math.floor(elapsed / 1000));
    }, 80);
    return () => {
      finished = true;
      window.clearInterval(timer);
    };
  }, [duelId]);

  return (
    <section className="flex flex-1 flex-col items-center justify-center py-12 text-center" aria-live="polite">
      <div className="flex h-[110px] items-end justify-center" aria-hidden="true">
        <div className="origin-bottom scale-[1.3]">
          <ChillPingu pose="pingpong" />
        </div>
      </div>
      <p className="mt-3 text-[13px] font-extrabold uppercase tracking-wider text-[#0284c7]">
        Đấu với {opponentName}
      </p>
      <div className="relative mt-6 flex h-44 w-44 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-[#0284c7]/10" />
        <motion.div
          key={left}
          initial={reduceMotion ? { opacity: 0.4 } : { scale: 0.55, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 18 }}
          className="relative flex h-36 w-36 items-center justify-center rounded-full bg-[#0284c7] text-white shadow-[0_8px_0_0_#0369a1]"
        >
          <span className="text-[72px] font-extrabold leading-none tabular-nums">{left}</span>
        </motion.div>
      </div>
      <p className="mt-6 text-[28px] font-extrabold">{countdownLabel(left)}</p>
      <div className="mt-4 flex gap-2" aria-hidden="true">
        {[3, 2, 1].map((step) => (
          <span
            key={step}
            className={`h-2.5 w-8 rounded-full ${step >= left ? "bg-[#0284c7]" : "bg-[#e2e7ff]"}`}
          />
        ))}
      </div>
    </section>
  );
}

export function DuelPlayScreen({ duelId }: { duelId: string }) {
  const router = useRouter();
  const { recordPracticeDay } = useProgress();
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<DuelView | null>(null);
  const [between, setBetween] = useState<Between | null>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<DuelFeedback | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const [livePosition, setLivePosition] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  /** Which end card shows. Clamped to the last one, so a reopened duel skips "Bạn đã xong". */
  const [endStep, setEndStep] = useState(0);
  const [startingNext, setStartingNext] = useState(false);
  const phaseRef = useRef<Phase>("loading");
  const generationRef = useRef(0);
  const viewRef = useRef<DuelView | null>(null);
  const playingPositionRef = useRef<number | null>(null);
  const clockStartRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    phaseRef.current = phase;
  });
  // Read during render by the word-bank memo below, so it stays in sync here.
  viewRef.current = view;

  const post = async (
    action: "open" | "begin" | "settle" | "forfeit",
    extra?: { position?: number; text?: string; elapsedMs?: number },
    keepalive = false,
  ) => {
    const response = await fetch(`/api/duels/${duelId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        pageSession: browserPlaySessionId(),
        ...extra,
      }),
      keepalive,
    });
    if (response.status === 401) {
      router.push("/account");
      return null;
    }
    if (response.status === 410) {
      router.push("/session-ended");
      return null;
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok || !isViewPayload(data)) return null;
    return data;
  };

  const remember = (next: DuelView) => {
    viewRef.current = next;
    setView(next);
  };

  const applyServer = (remote: DuelView) => {
    const current = viewRef.current;
    const merged = current ? mergeDuelView(current, remote) : remote;
    remember(merged);
  };

  const saveClip = (action: "begin" | "settle" | "forfeit", extra: { position: number; text?: string; elapsedMs?: number }) => {
    void (async () => {
      try {
        const payload = await post(action, extra);
        if (!payload) {
          if (action !== "begin") setSyncError("Chưa lưu được câu này. Mở lại trận nếu kết quả chưa khớp.");
          return;
        }
        if (action !== "begin") {
          applyServer(payload.view);
          if (payload.view.complete) {
            setBetween(null);
            setPhase("result");
          }
          setSyncError("");
        }
      } catch {
        if (action !== "begin") setSyncError("Chưa lưu được câu này. Mở lại trận nếu kết quả chưa khớp.");
      }
    })();
  };

  const startClip = (position: number) => {
    recordPracticeDay();
    clockStartRef.current = Date.now();
    setLivePosition(position);
    playingPositionRef.current = position;
    setDraft("");
    setFeedback(null);
    setBetween(null);
    setError("");
    setPhase("play");
    saveClip("begin", { position });
  };

  const forfeitLive = (keepalive = false) => {
    const position = playingPositionRef.current;
    const current = viewRef.current;
    if (phaseRef.current !== "play" || position == null || !current) return;
    const clip = current.clips.find((item) => item.position === position);
    if (!clip || isSettledState(clip.you.state)) return;
    const next = withClipSettled(current, position, { state: "forfeited" });
    playingPositionRef.current = null;
    remember(next);
    setFeedback(null);
    setDraft("");
    setQuitOpen(false);
    if (!hasPending(next)) setPhase("result");
    else {
      setBetween({ kind: "forfeit", elapsedMs: null, hasNext: true });
      setPhase("between");
    }
    if (keepalive) {
      void post("forfeit", { position }, true);
      return;
    }
    saveClip("forfeit", { position });
  };

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let alive = true;

    void (async () => {
      try {
        const payload = await post("open");
        if (!alive || generationRef.current !== generation) return;
        if (!payload) {
          setError("Không mở được trận đấu.");
          setPhase("error");
          return;
        }
        remember(payload.view);
        if (payload.view.complete || !hasPending(payload.view)) {
          setEndStep(Number.MAX_SAFE_INTEGER);
          setPhase("result");
          return;
        }
        setPhase("countdown");
      } catch {
        if (!alive || generationRef.current !== generation) return;
        setError("Không mở được trận đấu.");
        setPhase("error");
      }
    })();

    const forfeitKeepalive = () => {
      forfeitLive(true);
    };

    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      forfeitLive(false);
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", forfeitKeepalive);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", forfeitKeepalive);
      const mine = generation;
      window.setTimeout(() => {
        if (generationRef.current !== mine || phaseRef.current !== "play") return;
        forfeitKeepalive();
      }, 300);
    };
    // The bundle loads once per visit. Leaving the clip forfeits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId]);

  useEffect(() => {
    if (phase === "play") textareaRef.current?.focus();
  }, [phase, livePosition]);

  const clip = view?.clips.find((item) => item.position === livePosition) ?? null;
  const choiceMissingOptions =
    clip != null &&
    (clip.kind === "vi-choice" || clip.kind === "multiple-choice" || clip.kind === "listening-choice") &&
    !(clip.options && clip.options.length > 0);
  useEffect(() => {
    if (phase !== "play" || !choiceMissingOptions) return;
    let cancelled = false;
    void post("open").then((payload) => {
      if (!cancelled && payload) remember(payload.view);
    });
    return () => {
      cancelled = true;
    };
    // Refresh once so a choice card saved without its answers can load them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, livePosition, choiceMissingOptions]);
  const bankKey =
    view?.clips
      .map((item) => `${item.position}:${item.kind}:${item.script ?? ""}:${item.translationVi ?? ""}`)
      .join("|") ?? "";
  const orderBank = useMemo(() => {
    const currentView = viewRef.current;
    if (!currentView) return [];
    const current = currentView.clips.find((item) => item.position === livePosition);
    if (!current || (current.kind !== "order" && current.kind !== "listening-order") || !current.script) return [];
    const pool = currentView.clips.flatMap((item) =>
      item.script
        ? [{ id: String(item.position), script: item.script, translationVi: item.translationVi ?? "" }]
        : [],
    );
    return buildWordBank(
      { id: String(current.position), script: current.script, translationVi: current.translationVi ?? "" },
      pool,
    );
  }, [livePosition, bankKey]);
  const settledCount = view?.clips.filter((item) => isSettledState(item.you.state)).length ?? 0;
  const deadlineLabel =
    view?.expiresAt && !view.complete && phase !== "result" && phase !== "review"
      ? challengeLeftLabel(view.expiresAt, new Date(), "you")
      : null;
  const finishedAgo = view ? completedWhen(view) : null;
  const endSteps = view ? duelEndSteps(view) : [];
  const endIndex = Math.min(endStep, endSteps.length - 1);
  const currentEnd = endSteps[endIndex] ?? null;
  const moreEndSteps = endIndex < endSteps.length - 1;

  const finishCorrect = (text: string) => {
    if (!clip || clockStartRef.current == null) return;
    const elapsedMs = Math.max(0, Date.now() - clockStartRef.current);
    const current = viewRef.current;
    if (!current) return;
    playSuccessSound();
    const next = withClipSettled(current, clip.position, { state: "done", elapsedMs });
    playingPositionRef.current = null;
    remember(next);
    setFeedback(null);
    setDraft("");
    saveClip("settle", { position: clip.position, text, elapsedMs });
    if (!hasPending(next)) {
      if (next.yourOutcome === "win") playCelebrationSound();
      setPhase("result");
      return;
    }
    const upcoming = nextClip(next);
    if (!upcoming || !clipCanStart(upcoming)) {
      setError("Câu này không mở được.");
      setPhase("error");
      return;
    }
    startClip(upcoming.position);
  };

  const submit = () => {
    if (
      !draft.trim() ||
      phase !== "play" ||
      !clip?.script ||
      clip.kind === "order" ||
      clip.kind === "listening-order" ||
      clip.kind === "multiple-choice" ||
      clip.kind === "vi-choice" ||
      clip.kind === "listening-choice" ||
      clockStartRef.current == null
    ) {
      return;
    }
    const typed = draft.trim().slice(0, MAX_ANSWER_CHARS);
    const result = scoreAttempt(typed, clip.script);
    const words = result.words.map((word) => ({
      word: word.word,
      status: word.status,
      ...(word.typed ? { typed: word.typed } : {}),
    }));
    if (result.accuracy !== 100) {
      setFeedback({ accuracy: result.accuracy, accepted: false, tooFast: false, words });
      return;
    }
    finishCorrect(typed);
  };

  const submitOrder = (selected: string[]) => {
    if (
      phase !== "play" ||
      !clip?.script ||
      (clip.kind !== "order" && clip.kind !== "listening-order") ||
      clockStartRef.current == null
    ) {
      return;
    }
    const result = checkOrder(selected, clip.script);
    const words = result.words.map((word) => ({
      word: word.word,
      status: word.status,
      ...(word.typed ? { typed: word.typed } : {}),
    }));
    if (result.accuracy !== 100) {
      setFeedback({ accuracy: result.accuracy, accepted: false, tooFast: false, words });
      return;
    }
    finishCorrect(selected.join(" ").slice(0, MAX_ANSWER_CHARS));
  };

  const submitMc = (selectedId: string) => {
    if (
      phase !== "play" ||
      (clip?.kind !== "multiple-choice" && clip?.kind !== "vi-choice" && clip?.kind !== "listening-choice") ||
      clockStartRef.current == null
    ) {
      return;
    }
    const options = clip.options ?? [];
    const result = checkMc(selectedId, options);
    if (result.accuracy !== 100) {
      setFeedback({ accuracy: result.accuracy, accepted: false, tooFast: false, words: [] });
      return;
    }
    const correctText = options.find((option) => option.correct)?.text ?? "";
    finishCorrect(correctText.slice(0, MAX_ANSWER_CHARS));
  };

  const confirmQuit = () => {
    setQuitOpen(false);
    forfeitLive(false);
  };

  const continueDuel = () => {
    const current = viewRef.current;
    const upcoming = current ? nextClip(current) : null;
    if (!current || !upcoming) {
      setPhase("result");
      return;
    }
    if (!clipCanStart(upcoming)) {
      setError("Câu này không mở được.");
      return;
    }
    countdownStarts.delete(duelId);
    setPhase("countdown");
  };

  const startNextDuel = async () => {
    if (startingNext) return;
    setStartingNext(true);
    try {
      const response = await fetch("/api/duels", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; id?: string } | null;
      // A blocked start is explained on the duel page.
      router.push(data?.ok && typeof data.id === "string" ? `/duel/${data.id}` : "/duel");
    } catch {
      router.push("/duel");
    }
  };

  const insertChar = (char: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + char + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      const caret = start + char.length;
      textarea?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#faf8ff] text-[#131b2e]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-2 px-3">
          {phase === "play" ? (
            <button
              type="button"
              onClick={() => setQuitOpen(true)}
              className="flex h-10 items-center rounded-full px-2 text-[14px] font-extrabold text-[#6e7881]"
            >
              Thoát
            </button>
          ) : phase === "review" ? (
            <button
              type="button"
              onClick={() => setPhase("result")}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#0284c7]"
              aria-label="Về kết quả"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                arrow_back
              </span>
            </button>
          ) : (
            <Link
              href="/duel"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#0284c7]"
              aria-label="Về trang đấu"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                arrow_back
              </span>
            </Link>
          )}
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[15px] font-extrabold">
              {view ? `${view.yourName} vs ${view.opponentName}` : "Đấu"}
            </p>
            <p className="text-[12px] font-bold text-[#6e7881]">
              {phase === "play"
                ? `Câu ${settledCount + 1}/${DUEL_SIZE}`
                : phase === "between"
                  ? `${settledCount}/${DUEL_SIZE} câu`
                  : phase === "countdown"
                    ? "Sắp bắt đầu"
                    : phase === "result"
                      ? view?.complete
                        ? "Kết quả"
                        : "Đang chờ đối thủ"
                      : phase === "review"
                        ? "Từng câu"
                        : phase === "loading"
                        ? "Đang chuẩn bị"
                        : ""}
            </p>
          </div>
          <span className="w-10" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-4">
        {deadlineLabel ? (
          <p className="mb-3 text-center text-[13px] font-extrabold text-[#0284c7]">{deadlineLabel}</p>
        ) : null}
        {phase === "loading" ? (
          <section className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-[48px] text-[#0284c7]" aria-hidden="true">
              swords
            </span>
            <p className="mt-4 text-[20px] font-extrabold">Đang chuẩn bị trận đấu</p>
          </section>
        ) : null}

        {phase === "countdown" && view ? (
          <OpeningCountdown
            duelId={duelId}
            opponentName={view.opponentName}
            onDone={() => {
              const upcoming = nextClip(view);
              if (!upcoming || !clipCanStart(upcoming)) {
                setError("Không mở được câu đầu.");
                setPhase("error");
                return;
              }
              startClip(upcoming.position);
            }}
          />
        ) : null}

        {phase === "error" ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[16px] font-extrabold">{error}</p>
            <Link
              href="/duel"
              className={chunkyButton("primary", "mx-auto mt-4 w-fit")}
            >
              Về trang đấu
            </Link>
          </section>
        ) : null}

        {phase === "play" && clip && clipCanStart(clip) ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1" aria-label="Tiến độ trận đấu">
              {view?.clips.map((item) => {
                const filled = isSettledState(item.you.state) || item.position === clip.position;
                const lost = item.you.state === "forfeited";
                return (
                  <span
                    key={item.position}
                    className={`h-2.5 rounded-full ${
                      lost ? "bg-[#fda4af]" : filled ? "bg-[#0284c7]" : "bg-[#e2e7ff]"
                    }`}
                  />
                );
              })}
            </div>
            {feedback && !feedback.accepted ? (
              <section className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_0_#fecdd3]">
                <p className="text-[13px] font-extrabold text-[#be123c]">Chưa đúng. Sửa lại và gửi tiếp.</p>
                <div className="mt-2">
                  <Hint feedback={feedback} />
                </div>
              </section>
            ) : null}
            {error ? <p className="text-[14px] font-bold text-[#be123c]">{error}</p> : null}
            {syncError ? <p className="text-[14px] font-bold text-[#be123c]">{syncError}</p> : null}
            {clip.kind === "order" ? (
              <SentenceOrderCard
                key={`order-${clip.position}`}
                translation={clip.translationVi ?? ""}
                chips={orderBank}
                onSubmit={submitOrder}
              />
            ) : clip.kind === "listening-order" && clip.audioPath ? (
              <SentenceOrderCard
                key={`listen-order-${clip.position}`}
                chips={orderBank}
                onSubmit={submitOrder}
                afterPrompt={
                  <div className="mt-4">
                    <AudioPlayerCard key={`listen-order-audio-${clip.position}`} audioPath={clip.audioPath} />
                  </div>
                }
              />
            ) : clip.kind === "multiple-choice" || clip.kind === "vi-choice" ? (
              <McCard
                key={`mc-${clip.position}`}
                prompt={clip.kind === "vi-choice" ? (clip.translationVi ?? "") : (clip.script ?? "")}
                options={clip.options ?? []}
                onSubmit={submitMc}
              />
            ) : clip.kind === "listening-choice" && clip.audioPath ? (
              <McCard
                key={`listen-choice-${clip.position}`}
                prompt="Câu này nghĩa là gì?"
                options={clip.options ?? []}
                onSubmit={submitMc}
                icon="hearing"
                afterPrompt={
                  <AudioPlayerCard key={`listen-choice-audio-${clip.position}`} audioPath={clip.audioPath} />
                }
              />
            ) : clip.kind === "vi-input" ? (
              <>
                <section className="flex items-center gap-3 rounded-[24px] bg-white px-5 py-4 shadow-[0_4px_0_0_#dae2fd]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0284c7]/10 text-[#0284c7]">
                    <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                      translate
                    </span>
                  </div>
                  <p className="text-[20px] font-extrabold leading-snug text-[#131b2e]">{clip.translationVi}</p>
                </section>
                {feedback && clip.audioPath ? (
                  <AudioPlayerCard key={`vi-audio-${clip.position}`} audioPath={clip.audioPath} />
                ) : null}
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-[#6e7881]" htmlFor="duel-answer">
                  Gõ tiếng Đức
                </label>
                <textarea
                  ref={textareaRef}
                  id="duel-answer"
                  rows={3}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="Gõ câu tiếng Đức"
                  className="w-full resize-none rounded-[24px] bg-white px-4 py-4 text-[18px] font-semibold text-[#131b2e] shadow-[0_4px_0_0_#dae2fd] outline-none"
                />
                <div className="flex gap-1">
                  {SPECIAL_CHARS.map((char) => (
                    <button
                      key={char}
                      type="button"
                      onClick={() => insertChar(char)}
                      className="h-10 flex-1 rounded-xl bg-white text-[15px] font-extrabold text-[#131b2e] shadow-[0_3px_0_0_#dae2fd] active:translate-y-0.5"
                    >
                      {char}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!draft.trim()}
                  onClick={() => submit()}
                  className={chunkyButton(draft.trim() ? "primary" : "disabled", "w-full")}
                >
                  Kiểm tra
                </button>
              </>
            ) : clip.audioPath ? (
              <>
                <AudioPlayerCard key={clip.position} audioPath={clip.audioPath} />
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-[#6e7881]" htmlFor="duel-answer">
                  Bản chép chính tả
                </label>
                <textarea
                  ref={textareaRef}
                  id="duel-answer"
                  rows={3}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="Gõ câu tiếng Đức bạn vừa nghe"
                  className="w-full resize-none rounded-[24px] bg-white px-4 py-4 text-[18px] font-semibold text-[#131b2e] shadow-[0_4px_0_0_#dae2fd] outline-none"
                />
                <div className="flex gap-1">
                  {SPECIAL_CHARS.map((char) => (
                    <button
                      key={char}
                      type="button"
                      onClick={() => insertChar(char)}
                      className="h-10 flex-1 rounded-xl bg-white text-[15px] font-extrabold text-[#131b2e] shadow-[0_3px_0_0_#dae2fd] active:translate-y-0.5"
                    >
                      {char}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!draft.trim()}
                  onClick={() => submit()}
                  className={chunkyButton(draft.trim() ? "primary" : "disabled", "w-full")}
                >
                  Kiểm tra
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {phase === "between" && between ? (
          <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <div className="flex h-[150px] items-end justify-center" aria-hidden="true">
              <div className="origin-bottom scale-[1.7]">
                <ChillPingu pose="peekaboo" />
              </div>
            </div>
            <p className="mt-6 text-[28px] font-bold tracking-tight text-[#1d1d1f]">Câu này bị tính thua</p>
            <p className="mt-2 text-[17px] font-medium text-[#86868b]">
              {view ? `Đấu với ${view.opponentName}. ` : ""}
              Bạn sẽ tiếp tục với các câu còn lại.
            </p>
            {syncError ? <p className="mt-3 text-[14px] font-bold text-[#be123c]">{syncError}</p> : null}
            <button type="button" onClick={() => continueDuel()} className={chunkyButton("primary", "mt-8 w-full")}>
              Câu tiếp theo
            </button>
            <Link href="/duel" className={chunkyButton("secondary", "mt-3 w-full")}>
              Về trang đấu
            </Link>
          </section>
        ) : null}

        {phase === "result" && view && currentEnd ? (
          <DuelEndCard
            key={currentEnd.kind}
            step={currentEnd}
            view={view}
            primaryLabel={moreEndSteps ? "Tiếp tục" : startingNext ? "Đang tìm đối thủ..." : "Đấu mới"}
            primaryBusy={!moreEndSteps && startingNext}
            onPrimary={moreEndSteps ? () => setEndStep(endIndex + 1) : () => void startNextDuel()}
            secondaryLabel={moreEndSteps ? undefined : "Xem từng câu"}
            onSecondary={moreEndSteps ? undefined : () => setPhase("review")}
          />
        ) : null}
        {phase === "result" && syncError ? (
          <p className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-20 px-6 text-center text-[14px] font-bold text-[#be123c]">
            {syncError}
          </p>
        ) : null}

        {phase === "review" && view ? (
          <div className="flex flex-col gap-4">
            <p className="text-center text-[13px] font-semibold uppercase tracking-wider text-[#86868b]">
              {view.complete && !view.expired
                ? `${view.yourName} ${view.yourPoints}–${view.opponentPoints} ${view.opponentName}`
                : `Đấu với ${view.opponentName}`}
              {finishedAgo ? ` · ${finishedAgo}` : ""}
            </p>
            {syncError ? <p className="text-center text-[14px] font-bold text-[#be123c]">{syncError}</p> : null}
            <ol className="flex flex-col gap-2">
              {view.clips.map((item) => (
                <li key={item.position} className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_0_#dae2fd]">
                  <p className="text-[15px] font-extrabold text-[#131b2e]">
                    {item.script ?? `Câu ${item.position + 1}`}
                  </p>
                  {view.expired && item.winner === "pending" ? (
                    <p className="mt-1 text-[13px] font-semibold text-[#6e7881]">Hết hạn</p>
                  ) : view.complete ? (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              name: view.yourName,
                              time: clipTime(item.you.state, item.you.elapsedMs),
                              won: item.winner === "you",
                            },
                            {
                              name: view.opponentName,
                              time: opponentTime(item),
                              won: item.winner === "opponent",
                            },
                          ] as const
                        ).map((side, index) => (
                          <div
                            key={index}
                            className={`min-w-0 rounded-2xl px-2 py-2 text-center ${
                              side.won ? "bg-[#e0f2fe] shadow-[0_3px_0_0_#7dd3fc]" : "bg-[#f8fafc]"
                            }`}
                          >
                            <p
                              className={`truncate text-[12px] font-extrabold ${
                                side.won ? "text-[#0284c7]" : "text-[#6e7881]"
                              }`}
                            >
                              {side.name}
                            </p>
                            <p
                              className={`mt-1 text-[18px] font-extrabold tabular-nums ${
                                side.won ? "text-[#0284c7]" : "text-[#131b2e]"
                              }`}
                            >
                              {side.time}
                            </p>
                            <p
                              className={`mt-0.5 text-[11px] font-extrabold ${
                                side.won ? "text-[#0284c7]" : "invisible"
                              }`}
                              aria-hidden={side.won ? undefined : true}
                            >
                              Nhanh hơn
                            </p>
                          </div>
                        ))}
                      </div>
                      {clipNote(item) ? (
                        <p className="mt-2 text-center text-[13px] font-extrabold text-[#6e7881]">{clipNote(item)}</p>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#e0f2fe] px-3 py-2">
                      <p className="min-w-0 truncate text-[12px] font-extrabold text-[#0284c7]">{view.yourName}</p>
                      <p className="text-[18px] font-extrabold tabular-nums text-[#0284c7]">
                        {clipTime(item.you.state, item.you.elapsedMs)}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setPhase("result")} className={chunkyButton("secondary", "w-full")}>
              Về kết quả
            </button>
          </div>
        ) : null}
      </main>

      {quitOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#131b2e]/40 px-4 pb-8 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quit-clip-title"
            className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_8px_0_0_#dae2fd]"
          >
            <h2 id="quit-clip-title" className="text-[18px] font-extrabold">
              Thoát câu này?
            </h2>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-[#3e4850]">
              Câu đang chơi sẽ bị tính thua và không có thời gian. Bạn sẽ tiếp tục với các câu còn lại của trận đấu.
            </p>
            <button
              type="button"
              onClick={() => setQuitOpen(false)}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#0284c7] text-[16px] font-extrabold text-white shadow-[0_4px_0_0_#0369a1] active:translate-y-0.5 active:shadow-none"
            >
              Ở lại
            </button>
            <button
              type="button"
              onClick={() => confirmQuit()}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-[#fff1f2] text-[16px] font-extrabold text-[#be123c]"
            >
              Thoát câu này
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
