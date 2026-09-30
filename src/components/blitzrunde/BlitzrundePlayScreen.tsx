"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { McCard } from "@/components/session/McCard";
import { PairingCard } from "@/components/session/PairingCard";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { BlitzrundeCountdown, BlitzrundeLobby } from "@/components/blitzrunde/BlitzrundeLobby";
import { BlitzrundeResults } from "@/components/blitzrunde/BlitzrundeResults";
import {
  HEARTBEAT_MS,
  formatRemaining,
  nextStreak,
  pairingAccuracy,
  questionPoints,
  remainingMs,
  type AnswerRecord,
  type BlitzrundeCard,
  type BlitzrundeFinishReason,
  type BlitzrundeKind,
} from "@/lib/blitzrunde";
import type { StudentRoundView } from "@/lib/blitzrunde-store";
import { checkMc } from "@/lib/multiple-choice";
import { checkOrder } from "@/lib/sentence-order";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";

const LOBBY_POLL_MS = 3000;
const RESULTS_POLL_MS = 4000;
const TICK_MS = 250;
const FLASH_MS = 650;
const SUBMIT_RETRY_MS = [0, 1500, 3000, 6000, 12000, 20000];
/** Below this much time left, go straight to the first card instead of counting down. */
const COUNTDOWN_MIN_LEFT_MS = 20_000;

type Play = { index: number; startedAt: number };
type Flash = { accuracy: number; points: number };
type SubmitState = "idle" | "sending" | "sent" | "failed";

function MaterialIcon({ name, className, filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function readRound(data: unknown): { round: StudentRoundView; serverNow: number | null } | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { round?: StudentRoundView; serverNow?: unknown };
  if (!record.round || typeof record.round !== "object" || !record.round.meta) return null;
  const serverNow = typeof record.serverNow === "string" ? Date.parse(record.serverNow) : NaN;
  return { round: record.round, serverNow: Number.isFinite(serverNow) ? serverNow : null };
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">{children}</section>
  );
}

function Message({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <Screen>
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#fef3c7] text-[#b45309]">
        <MaterialIcon name={icon} className="text-[36px]" filled />
      </span>
      <p className="mt-4 text-[22px] font-extrabold text-[#131b2e]">{title}</p>
      {body ? <p className="mt-2 max-w-sm text-[15px] font-semibold text-[#6e7881]">{body}</p> : null}
      {action ? <div className="mt-6 w-full max-w-xs">{action}</div> : null}
    </Screen>
  );
}

function HomeButton({ label = "Về trang chủ" }: { label?: string }) {
  return (
    <Link
      href="/"
      className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0284c7] text-[15px] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_0_0_#0369a1] active:translate-y-1 active:shadow-none"
    >
      {label}
    </Link>
  );
}

function FlashPanel({ flash }: { flash: Flash }) {
  const perfect = flash.accuracy >= 100;
  const partial = !perfect && flash.accuracy > 0;
  const tone = perfect
    ? "bg-[#34C759]/15 text-[#1f7a3a] border-[#34C759]/40"
    : partial
      ? "bg-[#fef3c7] text-[#b45309] border-[#f59e0b]/40"
      : "bg-[#ff3b30]/10 text-[#be123c] border-[#ff3b30]/30";
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-[24px] border-2 px-6 py-12 ${tone}`} role="status">
      <MaterialIcon name={perfect ? "check_circle" : partial ? "timelapse" : "cancel"} className="text-[48px]" filled />
      <p className="text-[24px] font-extrabold">{perfect ? "Chính xác!" : partial ? "Gần đúng" : "Chưa đúng"}</p>
      <p className="text-[18px] font-extrabold tabular-nums">+{flash.points}</p>
    </div>
  );
}

function CardView({
  card,
  onAnswer,
  onPairingMistake,
}: {
  card: BlitzrundeCard;
  onAnswer: (kind: BlitzrundeKind, accuracy: number, answer: AnswerRecord["answer"]) => void;
  onPairingMistake: () => void;
}) {
  if (card.kind === "order") {
    return (
      <SentenceOrderCard
        key={`order-${card.position}`}
        translation={card.translationVi}
        chips={card.bank}
        onSubmit={(selected) => onAnswer("order", checkOrder(selected, card.script).accuracy, selected)}
      />
    );
  }
  if (card.kind === "multiple-choice") {
    return (
      <McCard
        key={`mc-${card.position}`}
        prompt={card.prompt}
        options={card.options}
        onSubmit={(selectedId) => onAnswer("multiple-choice", checkMc(selectedId, card.options).accuracy, selectedId)}
      />
    );
  }
  return (
    <PairingCard
      key={`pairing-${card.position}`}
      items={card.items}
      onMistake={onPairingMistake}
      onSolved={() => onAnswer("pairing", -1, null)}
      onNext={() => {}}
    />
  );
}

export function BlitzrundePlayScreen({ sessionId }: { sessionId: string }) {
  const [round, setRound] = useState<StudentRoundView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [play, setPlay] = useState<Play | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState<BlitzrundeFinishReason | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(false);

  const skewRef = useRef(0);
  const playRef = useRef<Play | null>(null);
  const answersRef = useRef<AnswerRecord[]>([]);
  const streakRef = useRef(0);
  const mistakesRef = useRef(0);
  const finishedRef = useRef(false);
  const joinTriedRef = useRef(false);
  const endsAtRef = useRef<string | null>(null);
  const deckLengthRef = useRef(0);
  const aliveRef = useRef(true);
  const sawLobbyRef = useRef(false);
  const countdownRef = useRef(false);

  const base = `/api/blitzrunde/${sessionId}`;

  const startPlay = useCallback((index: number) => {
    const next = { index, startedAt: Date.now() };
    playRef.current = next;
    mistakesRef.current = 0;
    setPlay(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(base, { cache: "no-store" });
      if (!aliveRef.current) return;
      if (!response.ok) {
        setLoadError(
          response.status === 404
            ? "Không tìm thấy vòng này."
            : response.status === 503
              ? "Máy chủ chưa sẵn sàng. Thử lại sau."
              : "Không tải được vòng này.",
        );
        return;
      }
      const parsed = readRound(await response.json());
      if (!parsed || !aliveRef.current) return;
      if (parsed.serverNow != null) skewRef.current = parsed.serverNow - Date.now();
      const next = parsed.round;
      endsAtRef.current = next.meta.endsAt;
      deckLengthRef.current = next.deck?.length ?? 0;
      setRound(next);
      setLoadError(null);
      if (next.meta.status === "lobby") sawLobbyRef.current = true;
      // Start playing the first time the deck shows up for a student who has not finished.
      if (
        next.meta.status === "active" &&
        next.deck &&
        next.deck.length > 0 &&
        !next.you?.submittedAt &&
        !playRef.current &&
        !countdownRef.current &&
        !finishedRef.current
      ) {
        // Count down only for students who waited in the lobby, not on a reload into a running round.
        const left = remainingMs(next.meta.endsAt, Date.now() + skewRef.current);
        if (sawLobbyRef.current && left > COUNTDOWN_MIN_LEFT_MS) {
          countdownRef.current = true;
          setCountdown(true);
        } else {
          startPlay(0);
        }
      }
    } catch {
      if (aliveRef.current) setLoadError("Mất kết nối. Đang thử lại…");
    }
  }, [base, startPlay]);

  const sendResult = useCallback(
    async (reason: BlitzrundeFinishReason) => {
      setSubmitState("sending");
      const body = JSON.stringify({ action: "submit", finishReason: reason, answers: answersRef.current });
      for (const delay of SUBMIT_RETRY_MS) {
        if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (!aliveRef.current) return;
        try {
          const response = await fetch(base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
          if (response.ok) {
            setSubmitState("sent");
            void load();
            return;
          }
          if (response.status >= 400 && response.status < 500) {
            const data = (await response.json().catch(() => null)) as { message?: string } | null;
            setSubmitError(data?.message ?? "Không lưu được kết quả.");
            setSubmitState("failed");
            return;
          }
        } catch {
          // Network hiccup: try again after the next delay.
        }
      }
      setSubmitError("Không gửi được kết quả. Kiểm tra mạng rồi tải lại trang.");
      setSubmitState("failed");
    },
    [base, load],
  );

  const finish = useCallback(
    (reason: BlitzrundeFinishReason) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      playRef.current = null;
      setPlay(null);
      setFlash(null);
      setDone(reason);
      if (reason === "deck_done") playCelebrationSound();
      void sendResult(reason);
    },
    [sendResult],
  );

  useEffect(() => {
    aliveRef.current = true;
    const first = window.setTimeout(() => void load(), 0);
    return () => {
      aliveRef.current = false;
      window.clearTimeout(first);
    };
  }, [load]);

  const status = round?.meta.status ?? null;
  const joined = round?.joined ?? false;
  const submitted = Boolean(round?.you?.submittedAt) || submitState === "sent";
  const playing = play != null && !done;

  // Join automatically: the student got here by tapping "Tham gia".
  useEffect(() => {
    if (!round || joined || joinTriedRef.current) return;
    if (round.meta.status !== "lobby" || !round.classMatches) return;
    joinTriedRef.current = true;
    void fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join" }),
    })
      .then(async (response) => {
        if (!aliveRef.current) return;
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          setJoinError(data?.message ?? "Không vào được phòng.");
          return;
        }
        void load();
      })
      .catch(() => {
        if (aliveRef.current) setJoinError("Mất kết nối. Tải lại trang để thử lại.");
      });
  }, [round, joined, base, load]);

  // Poll while waiting: in the lobby for the start, afterwards for the final standings.
  const waitingForResults = joined && (done != null || submitted) && status === "active";
  const pollMs = status === "lobby" ? LOBBY_POLL_MS : waitingForResults ? RESULTS_POLL_MS : null;
  useEffect(() => {
    if (pollMs == null) return;
    const timer = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, load]);

  // Clock: corrected for the device's offset from the server.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const current = Date.now() + skewRef.current;
      setNow(current);
      if (remainingMs(endsAtRef.current, current) <= 0) finish("time_up");
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [playing, finish]);

  // Heartbeat: stats only (who is still connected, how far), plus it tells us if the teacher ended early.
  useEffect(() => {
    if (!playing) return;
    const beat = () => {
      void fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", index: playRef.current?.index ?? deckLengthRef.current }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          if (!data || typeof data !== "object" || !aliveRef.current) return;
          const record = data as { status?: unknown; endsAt?: unknown; serverNow?: unknown };
          const serverNow = typeof record.serverNow === "string" ? Date.parse(record.serverNow) : NaN;
          if (Number.isFinite(serverNow)) skewRef.current = serverNow - Date.now();
          if (record.status === "ended" || record.status === "cancelled") {
            const left = remainingMs(endsAtRef.current, Date.now() + skewRef.current);
            finish(left > 0 ? "teacher_ended" : "time_up");
          }
        })
        .catch(() => {
          // Offline: the teacher will see this student as disconnected.
        });
    };
    const first = window.setTimeout(beat, 0);
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [playing, base, finish]);

  const answer = useCallback(
    (kind: BlitzrundeKind, reported: number, value: AnswerRecord["answer"]) => {
      const current = playRef.current;
      if (!current || finishedRef.current) return;
      const accuracy = kind === "pairing" ? pairingAccuracy(mistakesRef.current) : reported;
      const timeMs = Date.now() - current.startedAt;
      const streakBefore = streakRef.current;
      const points = questionPoints(accuracy, timeMs, streakBefore);
      const streakAfter = nextStreak(accuracy, streakBefore);
      streakRef.current = streakAfter;
      answersRef.current.push({
        position: current.index,
        kind,
        accuracy,
        timeMs,
        points,
        streak: streakAfter,
        answer: kind === "pairing" ? mistakesRef.current : value,
      });
      playRef.current = null;
      setScore((total) => total + points);
      setStreak(streakAfter);
      setFlash({ accuracy, points });
      if (accuracy >= 100) playSuccessSound();

      window.setTimeout(() => {
        if (!aliveRef.current || finishedRef.current) return;
        setFlash(null);
        const next = current.index + 1;
        if (next >= deckLengthRef.current) finish("deck_done");
        else startPlay(next);
      }, FLASH_MS);
    },
    [finish, startPlay],
  );

  const endCountdown = useCallback(() => {
    setCountdown(false);
    if (!aliveRef.current || finishedRef.current || playRef.current) return;
    startPlay(0);
  }, [startPlay]);

  const onPairingMistake = useCallback(() => {
    mistakesRef.current += 1;
  }, []);

  const deck = round?.deck ?? null;
  const card = play && deck ? deck[play.index] : null;
  const deckSize = round?.meta.deckSize ?? 0;
  const left = remainingMs(round?.meta.endsAt ?? null, now);
  const answeredCount = play ? play.index : flash ? deckSize : 0;

  let body: React.ReactNode;
  if (!round) {
    body = loadError ? (
      <Message icon="error" title={loadError} action={<HomeButton />} />
    ) : (
      <Message icon="electric_bolt" title="Đang tải Blitzrunde…" />
    );
  } else if (status === "cancelled") {
    body = <Message icon="block" title="Vòng này đã bị huỷ" body="Giáo viên đã đóng phòng." action={<HomeButton />} />;
  } else if (!joined && !submitted) {
    if (!round.classMatches) {
      body = <Message icon="lock" title="Vòng này dành cho lớp khác" action={<HomeButton />} />;
    } else if (status === "lobby") {
      body = joinError ? (
        <Message icon="error" title={joinError} action={<HomeButton />} />
      ) : (
        <Message icon="login" title="Đang vào phòng…" />
      );
    } else if (status === "ended" && round.standings) {
      body = (
        <BlitzrundeResults standings={round.standings} youId={null} ranked={round.meta.ranked} fallbackScore={0} />
      );
    } else {
      body = (
        <Message
          icon="timer"
          title="Vòng đã bắt đầu"
          body="Phòng đã khoá khi giáo viên bấm bắt đầu. Lần sau hãy vào sớm hơn nhé!"
          action={<HomeButton />}
        />
      );
    }
  } else if (status === "lobby") {
    body = <BlitzrundeLobby round={round} />;
  } else if (countdown) {
    body = <BlitzrundeCountdown onDone={endCountdown} />;
  } else if (playing && card) {
    body = (
      <div className="flex flex-col gap-4">
        {flash ? (
          <FlashPanel flash={flash} />
        ) : (
          <CardView key={card.position} card={card} onAnswer={answer} onPairingMistake={onPairingMistake} />
        )}
      </div>
    );
  } else if (playing && flash) {
    body = <FlashPanel flash={flash} />;
  } else if (status === "ended" && round.standings) {
    body = (
      <BlitzrundeResults
        standings={round.standings}
        youId={round.you?.userId ?? null}
        ranked={round.meta.ranked}
        fallbackScore={score}
      />
    );
  } else {
    const reasonLine =
      done === "deck_done"
        ? "Bạn đã làm hết thẻ!"
        : done === "teacher_ended"
          ? "Giáo viên đã kết thúc vòng."
          : "Hết giờ!";
    // After a reload the local score is gone, but the stored result is not.
    const shownScore = done ? score : (round.you?.finalScore ?? score);
    body = (
      <Message
        icon={submitState === "failed" ? "error" : "hourglass_top"}
        title={submitState === "failed" ? "Chưa lưu được kết quả" : `${shownScore.toLocaleString("vi-VN")} điểm`}
        body={
          submitState === "failed"
            ? (submitError ?? undefined)
            : submitState === "sending"
              ? `${reasonLine} Đang lưu kết quả…`
              : `${reasonLine} Chờ các bạn khác xong để xem bảng xếp hạng.`
        }
      />
    );
  }

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#faf8ff] text-[#131b2e]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-2 px-3">
          {playing ? (
            <span className="w-16" aria-hidden="true" />
          ) : (
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#0284c7]"
              aria-label="Về trang chủ"
            >
              <MaterialIcon name="arrow_back" className="text-[20px]" />
            </Link>
          )}
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[15px] font-extrabold">
              Blitzrunde{round ? ` · ${round.meta.levelLabel} ${round.meta.lektionLabel}` : ""}
            </p>
            {playing ? (
              <p className="text-[12px] font-bold text-[#6e7881] tabular-nums">
                {score.toLocaleString("vi-VN")} điểm{streak > 1 ? ` · 🔥 ${streak}` : ""}
              </p>
            ) : round ? (
              <p className="text-[12px] font-bold text-[#6e7881]">{round.meta.classLabel}</p>
            ) : null}
          </div>
          {playing ? (
            <span
              className={`w-16 text-right text-[17px] font-extrabold tabular-nums ${left <= 30_000 ? "text-[#be123c]" : "text-[#131b2e]"}`}
            >
              {now > 0 ? formatRemaining(left) : "7:00"}
            </span>
          ) : (
            <span className="w-10" aria-hidden="true" />
          )}
        </div>
        {playing && deckSize > 0 ? (
          <div className="mx-auto h-1.5 w-full max-w-md px-3 pb-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e7ff]">
              <div
                className="h-full rounded-full bg-[#f59e0b] transition-[width] duration-300"
                style={{ width: `${Math.round((answeredCount / deckSize) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-4">{body}</main>
    </div>
  );
}
