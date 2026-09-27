"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import {
  DUEL_SIZE,
  formatDuelTime,
  type DuelClipView,
  type DuelFeedback,
  type DuelView,
} from "@/lib/duels";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";

const SPECIAL_CHARS = ["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"] as const;

let browserPlaySession = "";

function browserPlaySessionId(): string {
  if (!browserPlaySession) browserPlaySession = crypto.randomUUID();
  return browserPlaySession;
}

type Phase = "loading" | "play" | "between" | "result" | "error";

type Between = {
  kind: "correct" | "forfeit";
  elapsedMs: number | null;
  hasNext: boolean;
};

function isViewPayload(value: unknown): value is { view: DuelView; feedback: DuelFeedback | null } {
  if (!value || typeof value !== "object") return false;
  const view = (value as { view?: DuelView }).view;
  return Boolean(view && Array.isArray(view.clips) && typeof view.id === "string");
}

function activeClip(view: DuelView | null): DuelClipView | null {
  if (!view || view.nextPosition == null) return null;
  return view.clips.find((clip) => clip.position === view.nextPosition) ?? null;
}

function hasPending(view: DuelView): boolean {
  return view.clips.some((clip) => clip.you.state === "pending");
}

function clipSummary(clip: DuelClipView, opponentName: string): string {
  if (clip.winner === "pending") return "Đang chờ";
  if (clip.winner === "you") return "Bạn nhanh hơn";
  if (clip.winner === "opponent") return `${opponentName} nhanh hơn`;
  if (clip.you.elapsedMs == null && clip.opponent.elapsedMs == null) return "Cả hai bỏ";
  return "Hòa thời gian";
}

function opponentTime(clip: DuelClipView): string {
  if (clip.opponent.state === "hidden" || clip.opponent.state === "pending") return "Đang chờ";
  if (clip.opponent.state === "forfeited" || clip.opponent.elapsedMs == null) return "Bỏ";
  return formatDuelTime(clip.opponent.elapsedMs);
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

export function DuelPlayScreen({ duelId }: { duelId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<DuelView | null>(null);
  const [between, setBetween] = useState<Between | null>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<DuelFeedback | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const phaseRef = useRef<Phase>("loading");
  const generationRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  phaseRef.current = phase;

  const post = async (action: "enter" | "answer" | "forfeit", text?: string) => {
    const response = await fetch(`/api/duels/${duelId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        pageSession: browserPlaySessionId(),
        ...(text != null ? { text } : {}),
      }),
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

  const showView = (next: DuelView) => {
    setView(next);
    const clip = activeClip(next);
    if (clip?.you.state === "active" && next.startedAt) {
      setPhase("play");
      setBetween(null);
      return;
    }
    if (hasPending(next)) {
      setBetween({ kind: "forfeit", elapsedMs: null, hasNext: true });
      setPhase("between");
      return;
    }
    setPhase("result");
  };

  useEffect(() => {
    const session = browserPlaySessionId();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let alive = true;

    void (async () => {
      try {
        const payload = await post("enter");
        if (!alive || generationRef.current !== generation || !payload) {
          if (alive && generationRef.current === generation && !payload) {
            setError("Không mở được trận đấu.");
            setPhase("error");
          }
          return;
        }
        showView(payload.view);
      } catch {
        if (!alive) return;
        setError("Không mở được trận đấu.");
        setPhase("error");
      }
    })();

    const forfeitKeepalive = () => {
      if (phaseRef.current !== "play") return;
      void fetch(`/api/duels/${duelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forfeit", pageSession: session }),
        keepalive: true,
      });
    };

    const onHide = () => {
      if (document.visibilityState !== "hidden" || phaseRef.current !== "play") return;
      void (async () => {
        const payload = await post("forfeit");
        if (!payload) return;
        const next = hasPending(payload.view);
        setView(payload.view);
        setFeedback(null);
        setDraft("");
        setQuitOpen(false);
        if (!next) {
          setPhase("result");
          return;
        }
        setBetween({ kind: "forfeit", elapsedMs: null, hasNext: true });
        setPhase("between");
      })();
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
    // The session clock starts once per visit to this duel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId]);

  useEffect(() => {
    if (phase !== "play" || !view?.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [phase, view?.startedAt]);

  useEffect(() => {
    if (phase === "play") textareaRef.current?.focus();
  }, [phase, view?.nextPosition]);

  const clip = activeClip(view);
  const elapsed =
    view?.startedAt && phase === "play" ? Math.max(0, now - Date.parse(view.startedAt)) : 0;
  const settledCount = view?.clips.filter((item) => item.you.state === "done" || item.you.state === "forfeited").length ?? 0;

  const submit = async () => {
    if (!draft.trim() || busy || phase !== "play") return;
    setBusy(true);
    try {
      const payload = await post("answer", draft);
      if (!payload) {
        setError("Không gửi được câu trả lời.");
        return;
      }
      setView(payload.view);
      if (payload.feedback?.tooFast) {
        setFeedback(payload.feedback);
        return;
      }
      if (!payload.feedback?.accepted) {
        setFeedback(payload.feedback);
        return;
      }
      playSuccessSound();
      setFeedback(null);
      setDraft("");
      const doneClip = payload.view.clips.find((item) => item.position === clip?.position);
      if (!hasPending(payload.view)) {
        if (payload.view.yourOutcome === "win") playCelebrationSound();
        setPhase("result");
        return;
      }
      setBetween({
        kind: "correct",
        elapsedMs: doneClip?.you.elapsedMs ?? null,
        hasNext: true,
      });
      setPhase("between");
    } finally {
      setBusy(false);
    }
  };

  const confirmQuit = async () => {
    setQuitOpen(false);
    setBusy(true);
    try {
      const payload = await post("forfeit");
      if (!payload) return;
      setView(payload.view);
      setFeedback(null);
      setDraft("");
      if (!hasPending(payload.view)) {
        setPhase("result");
        return;
      }
      setBetween({ kind: "forfeit", elapsedMs: null, hasNext: true });
      setPhase("between");
    } finally {
      setBusy(false);
    }
  };

  const continueDuel = async () => {
    setBusy(true);
    try {
      const payload = await post("enter");
      if (!payload) return;
      setDraft("");
      setFeedback(null);
      showView(payload.view);
    } finally {
      setBusy(false);
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
            <p className="truncate text-[15px] font-extrabold">{view?.opponentName ?? "Đấu"}</p>
            <p className="text-[12px] font-bold text-[#6e7881]">
              {phase === "play" ? `Câu ${settledCount + 1}/${DUEL_SIZE}` : "Kết quả"}
            </p>
          </div>
          <p className="w-16 text-right text-[15px] font-extrabold tabular-nums text-[#0284c7]">
            {phase === "play" ? formatDuelTime(elapsed) : ""}
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-4">
        {phase === "loading" ? (
          <div className="h-48 animate-pulse rounded-[28px] bg-white shadow-[0_4px_0_0_#dae2fd]" />
        ) : null}

        {phase === "error" ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[16px] font-extrabold">{error}</p>
            <Link
              href="/duel"
              className="mt-4 inline-flex h-12 items-center justify-center rounded-2xl bg-[#0284c7] px-5 text-[15px] font-extrabold text-white shadow-[0_4px_0_0_#0369a1]"
            >
              Về trang đấu
            </Link>
          </section>
        ) : null}

        {phase === "play" && clip?.audioPath ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1" aria-label="Tiến độ trận đấu">
              {view?.clips.map((item) => {
                const filled = item.you.state === "done" || item.you.state === "forfeited" || item.position === clip.position;
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
            <AudioPlayerCard key={clip.position} audioPath={clip.audioPath} />
            {feedback?.tooFast ? (
              <p className="rounded-2xl bg-[#fff4d6] px-4 py-3 text-[14px] font-bold text-[#855300] shadow-[0_3px_0_0_#f4d48a]">
                Đúng rồi, nhưng thời gian dưới 2 giây không được tính. Hãy gửi lại.
              </p>
            ) : null}
            {feedback && !feedback.accepted && !feedback.tooFast ? (
              <section className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_0_#fecdd3]">
                <p className="text-[13px] font-extrabold text-[#be123c]">Chưa đúng. Sửa lại và gửi tiếp.</p>
                <div className="mt-2">
                  <Hint feedback={feedback} />
                </div>
              </section>
            ) : null}
            {error ? <p className="text-[14px] font-bold text-[#be123c]">{error}</p> : null}
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
                  void submit();
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
              disabled={!draft.trim() || busy}
              onClick={() => void submit()}
              className="flex h-14 items-center justify-center rounded-2xl bg-[#0284c7] text-[17px] font-extrabold text-white shadow-[0_4px_0_0_#0369a1] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:bg-[#e2e7ff] disabled:text-[#94a3b8] disabled:shadow-none"
            >
              Kiểm tra
            </button>
          </div>
        ) : null}

        {phase === "between" && between ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[28px] font-extrabold">
              {between.kind === "correct" ? "Đúng" : "Câu này bị tính thua"}
            </p>
            <p className="mt-2 text-[15px] font-semibold text-[#6e7881]">
              {between.kind === "correct"
                ? `Thời gian của bạn: ${formatDuelTime(between.elapsedMs)}`
                : "Câu này không có thời gian. Bạn sẽ tiếp tục với các câu còn lại."}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void continueDuel()}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-[#0284c7] text-[17px] font-extrabold text-white shadow-[0_4px_0_0_#0369a1] active:translate-y-0.5 active:shadow-none"
            >
              Câu tiếp theo
            </button>
            <Link href="/duel" className="mt-3 inline-flex text-[14px] font-extrabold text-[#0284c7]">
              Về trang đấu
            </Link>
          </section>
        ) : null}

        {phase === "result" && view ? (
          <div className="flex flex-col gap-4">
            <section className="rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-5 text-white shadow-[0_6px_0_0_#0369a1]">
              <p className="text-[13px] font-bold uppercase tracking-wider text-sky-100">
                {view.complete ? "Kết quả" : "Đang chờ đối thủ"}
              </p>
              <p className="mt-1 text-[40px] font-extrabold leading-none tabular-nums">
                {view.yourPoints}
                <span className="px-2 text-[28px] text-sky-100">–</span>
                {view.opponentPoints}
              </p>
              <p className="mt-2 text-[16px] font-extrabold">
                {view.complete
                  ? view.yourOutcome === "win"
                    ? `Bạn thắng · +${view.yourXp ?? 50} XP`
                    : view.yourOutcome === "loss"
                      ? `Bạn thua · +${view.yourXp ?? 20} XP`
                      : `Hòa · +${view.yourXp ?? 35} XP`
                  : `${view.opponentName} chưa xong phần của họ.`}
              </p>
            </section>
            <ol className="flex flex-col gap-2">
              {view.clips.map((item) => (
                <li key={item.position} className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_0_#dae2fd]">
                  <p className="text-[15px] font-extrabold text-[#131b2e]">
                    {item.script ?? `Câu ${item.position + 1}`}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[#6e7881]">
                    Bạn{" "}
                    {item.you.state === "forfeited"
                      ? "Bỏ"
                      : item.you.elapsedMs == null
                        ? "—"
                        : formatDuelTime(item.you.elapsedMs)}
                    {" · "}
                    {view.opponentName} {opponentTime(item)}
                  </p>
                  <p className="mt-1 text-[13px] font-extrabold text-[#0284c7]">{clipSummary(item, view.opponentName)}</p>
                </li>
              ))}
            </ol>
            <Link
              href="/duel"
              className="flex h-14 items-center justify-center rounded-2xl bg-[#0284c7] text-[17px] font-extrabold text-white shadow-[0_4px_0_0_#0369a1] active:translate-y-0.5 active:shadow-none"
            >
              Về trang đấu
            </Link>
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
              onClick={() => void confirmQuit()}
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
