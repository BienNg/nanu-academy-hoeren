"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { DictationInputCard } from "@/components/session/DictationInputCard";
import { FeedbackResultCard } from "@/components/session/FeedbackResultCard";
import { McCard } from "@/components/session/McCard";
import { McFeedbackCard } from "@/components/session/McFeedbackCard";
import { ProfileButton } from "@/components/ProfileButton";
import { BOX_INTERVAL_DAYS, intervalLabel } from "@/lib/leitner";
import type { BoxMove, ReviewAnswerInput, ReviewCard, ReviewCardKind } from "@/lib/leitner-store";
import { missedAttempt, type MissedAttempt } from "@/lib/listening-runs";
import { checkMc, type McResult } from "@/lib/multiple-choice";
import { requeueMissedClip } from "@/lib/progress";
import { scoreAttempt, type ScoreResult } from "@/lib/scoring";
import { playCelebrationSound, playSuccessSound } from "@/lib/sfx";

type ReviewSessionProps = {
  cards: ReviewCard[];
};

type ClipMiss = {
  kinds: Set<ReviewCardKind>;
  answers: ReviewAnswerInput["missedAnswers"];
};

type Saved = {
  moves: BoxMove[];
  due: number;
};

function Icon({ name, className, filled = false }: { name: string; className?: string; filled?: boolean }) {
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

function clipKeyOf(card: ReviewCard): string {
  return `${card.clip.lessonKey}\t${card.clip.id}`;
}

function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)}/${Number(month)}`;
}

/** Box chip shown above each card, e.g. "Hộp 2 · A1.1 · Lektion 3". */
function CardContext({ card }: { card: ReviewCard }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-[#6e7881]">
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e0f2fe] px-2.5 py-1 text-[#0369a1]">
        <Icon name="inventory_2" className="text-[15px]" />
        Hộp {card.clip.box}
      </span>
      {card.clip.lapses > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1e6] px-2.5 py-1 text-[#9a3412]">
          <Icon name="replay" className="text-[15px]" />
          Đã sai {card.clip.lapses} lần
        </span>
      ) : null}
      <span className="truncate">{card.clip.lessonLabel}</span>
    </div>
  );
}

function MoveRow({ move, card }: { move: BoxMove; card: ReviewCard | undefined }) {
  const up = move.from != null && move.to > move.from;
  const reset = move.to === 0;
  const tone = reset ? "text-[#c2410c]" : up ? "text-[#0f766e]" : "text-[#6e7881]";
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-[0_3px_0_0_#dae2fd]">
      <Icon
        name={reset ? "restart_alt" : up ? "trending_up" : "trending_flat"}
        className={`text-[22px] ${tone}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-extrabold text-[#131b2e]">{card?.clip.script ?? move.clipId}</span>
        <span className="block truncate text-[12px] font-semibold text-[#6e7881]">{card?.clip.translationVi}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[13px] font-extrabold tabular-nums ${tone}`}>
          {move.from == null || move.from === move.to ? `Hộp ${move.to}` : `Hộp ${move.from} → ${move.to}`}
        </span>
        <span className="block text-[11px] font-bold text-[#94a3b8]">gặp lại {shortDay(move.dueOn)}</span>
      </span>
    </li>
  );
}

export function ReviewSession({ cards: initialCards }: ReviewSessionProps) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState(0);
  const [mcResult, setMcResult] = useState<McResult | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"review" | "saving" | "done" | "error">("review");
  const [saved, setSaved] = useState<Saved | null>(null);
  const missesRef = useRef(new Map<string, ClipMiss>());
  const [done, setDone] = useState(0);

  /** One entry per clip, in the order the clips were first dealt. */
  const clipCards = useMemo(() => {
    const byClip = new Map<string, ReviewCard>();
    for (const card of initialCards) if (!byClip.has(clipKeyOf(card))) byClip.set(clipKeyOf(card), card);
    return byClip;
  }, [initialCards]);
  const totalCards = initialCards.length;

  const card = cards[index];
  const isPerfect = mcResult?.accuracy === 100 || scoreResult?.accuracy === 100;

  const rememberMiss = (current: ReviewCard, attempt: MissedAttempt | null) => {
    const key = clipKeyOf(current);
    const miss = missesRef.current.get(key) ?? { kinds: new Set<ReviewCardKind>(), answers: {} };
    miss.kinds.add(current.kind);
    if (attempt && !miss.answers[current.kind]) miss.answers[current.kind] = attempt;
    missesRef.current.set(key, miss);
  };

  const handleMcSubmit = (selectedId: string) => {
    if (!card?.options) return;
    const result = checkMc(selectedId, card.options);
    setMcResult(result);
    if (result.accuracy === 100) {
      playSuccessSound();
      return;
    }
    const selected = card.options.find((option) => option.id === selectedId);
    const correct = card.options.find((option) => option.correct);
    rememberMiss(card, selected && correct ? missedAttempt(selected.text, correct.text) : null);
  };

  const handleInputSubmit = (value: string) => {
    if (!card) return;
    setDraft(value);
    const result = scoreAttempt(value, card.clip.script);
    setScoreResult(result);
    if (result.accuracy === 100) {
      playSuccessSound();
      return;
    }
    rememberMiss(card, missedAttempt(value, card.clip.script));
  };

  const save = async () => {
    setPhase("saving");
    const answers: ReviewAnswerInput[] = [...clipCards.values()].map((first) => {
      const miss = missesRef.current.get(clipKeyOf(first));
      return {
        lessonKey: first.clip.lessonKey,
        clipId: first.clip.id,
        missed: Boolean(miss),
        missedKinds: miss ? [...miss.kinds] : [],
        missedAnswers: miss?.answers ?? {},
      };
    });
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(`Review was not saved (${response.status})`);
      const data = (await response.json()) as { moves?: BoxMove[]; due?: number };
      setSaved({ moves: data.moves ?? [], due: typeof data.due === "number" ? data.due : 0 });
      setPhase("done");
      playCelebrationSound();
    } catch (error) {
      console.error(error);
      setPhase("error");
    }
  };

  const handleNext = () => {
    if (!card) return;
    setMcResult(null);
    setScoreResult(null);
    setDraft("");
    setTurn((value) => value + 1);
    if (!isPerfect) {
      // A missed card comes back later in the round until it is right.
      setCards(requeueMissedClip(cards, index));
      return;
    }
    setDone((value) => value + 1);
    if (index + 1 >= cards.length) {
      void save();
      return;
    }
    setIndex(index + 1);
  };

  const nextRound = () => {
    router.refresh();
  };

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col overflow-x-hidden bg-[#fbfbfd]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <header className="sticky top-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
          <Link
            href="/review"
            aria-label="Quay lại"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#0066cc] transition-colors hover:bg-[#f5f5f7] active:scale-95"
          >
            <Icon name="arrow_back_ios_new" className="text-[20px]" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3 text-center">
            <span className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#86868b]">Ôn tập</span>
            <h1 className="truncate text-[15px] font-bold tracking-tight text-[#1d1d1f]">
              {clipCards.size} câu đến hạn
            </h1>
          </div>
          <div className="flex shrink-0 items-center">
            <ProfileButton />
          </div>
        </div>
      </header>

      {phase === "done" && saved ? (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 pb-16 pt-8">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#dcfce7] text-[#15803d]">
              <Icon name="task_alt" className="text-[36px]" filled />
            </div>
            <h2 className="text-[26px] font-extrabold tracking-tight text-[#1d1d1f]">Xong một lượt ôn</h2>
            <p className="mt-1 text-[15px] font-semibold text-[#6e7881]">
              {saved.moves.filter((move) => move.from != null && move.to > move.from).length} câu lên hộp ·{" "}
              {saved.moves.filter((move) => move.to === 0).length} câu về hộp 0
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {saved.moves.map((move) => (
              <MoveRow
                key={`${move.lessonKey}:${move.clipId}`}
                move={move}
                card={clipCards.get(`${move.lessonKey}\t${move.clipId}`)}
              />
            ))}
          </ul>
          <div className="mt-2 flex flex-col gap-3">
            {saved.due > 0 ? (
              <button
                type="button"
                onClick={nextRound}
                className="flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[#0066cc] px-6 text-[17px] font-semibold text-white active:scale-[0.99]"
              >
                Ôn tiếp · còn {saved.due} câu
              </button>
            ) : null}
            <Link
              href="/review"
              className={`flex h-[56px] w-full items-center justify-center rounded-[16px] px-6 text-[17px] font-semibold ${
                saved.due > 0 ? "bg-[#f5f5f7] text-[#0066cc]" : "bg-[#0066cc] text-white"
              }`}
            >
              Về Ôn tập
            </Link>
          </div>
          <p className="text-center text-[12px] font-semibold text-[#94a3b8]">
            Hộp {BOX_INTERVAL_DAYS.length - 1} là hộp cao nhất: câu ở đó quay lại sau{" "}
            {intervalLabel(BOX_INTERVAL_DAYS[BOX_INTERVAL_DAYS.length - 1])}.
          </p>
        </main>
      ) : phase === "error" ? (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 pb-32 text-center">
          <h2 className="text-[24px] font-extrabold tracking-tight text-[#1d1d1f]">Chưa lưu được lượt ôn</h2>
          <p className="text-[15px] font-medium text-[#6e7881]">Kiểm tra kết nối mạng rồi thử lại.</p>
          <button
            type="button"
            onClick={() => void save()}
            className="flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[#0066cc] px-6 text-[17px] font-semibold text-white"
          >
            Thử lại
          </button>
        </main>
      ) : !card || phase === "saving" ? (
        <main className="flex flex-1 items-center justify-center pb-32">
          <p className="text-[15px] font-semibold text-[#6e7881]">Đang lưu…</p>
        </main>
      ) : (
        <main className="relative flex w-full flex-1 flex-col items-center">
          <div className="flex w-full max-w-2xl flex-col px-6 pb-24">
            <div
              className="flex flex-col pt-6 pb-4"
              role="progressbar"
              aria-label="Tiến độ lượt ôn"
              aria-valuemin={0}
              aria-valuemax={totalCards}
              aria-valuenow={Math.min(done, totalCards)}
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e8e8ed]">
                <div
                  className="h-full rounded-full bg-[#0066cc] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ width: `${(Math.min(done, totalCards) / Math.max(totalCards, 1)) * 100}%` }}
                />
              </div>
            </div>

            <CardContext card={card} />

            {card.kind === "multiple-choice" && !mcResult ? (
              <McCard
                key={`mc-${card.key}-${turn}`}
                prompt={card.clip.script}
                options={card.options ?? []}
                onSubmit={handleMcSubmit}
              />
            ) : card.kind === "multiple-choice" && mcResult ? (
              <McFeedbackCard
                result={mcResult}
                options={card.options ?? []}
                clip={card.clip}
                onNext={handleNext}
                nextLabel="Tiếp theo"
              />
            ) : scoreResult ? (
              <>
                <AudioPlayerCard key={`audio-${card.key}-${turn}`} audioPath={card.clip.audioPath} />
                <FeedbackResultCard
                  result={scoreResult}
                  clip={card.clip}
                  onNext={handleNext}
                  nextLabel="Tiếp theo"
                  skipOnMistake
                />
              </>
            ) : (
              <DictationInputCard
                key={`input-${card.key}-${turn}`}
                prompt={card.clip.translationVi}
                value={draft}
                onChange={setDraft}
                onSubmit={handleInputSubmit}
              />
            )}
          </div>
        </main>
      )}
    </div>
  );
}
