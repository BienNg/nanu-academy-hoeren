"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { BlitzrundeProgressChart } from "@/components/blitzrunde/BlitzrundeProgressChart";
import {
  cancelBlitzrunde,
  createBlitzrunde,
  endBlitzrunde,
  getBlitzrundeAdminRound,
  listBlitzrundeRounds,
  previewBlitzrundeDeck,
  startBlitzrunde,
} from "@/app/admin/blitzrunde/actions";
import { formatAdminTimestamp, type AdminClassOption } from "@/lib/admin-overview";
import {
  BLITZRUNDE_ICON,
  LATE_SUBMIT_MS,
  MIN_RANKED,
  THIN_DECK_WARNING,
  formatRemaining,
  remainingMs,
  type AnswerRecord,
  type BlitzrundeCard,
  type BlitzrundeKind,
  type ClassProgress,
  type ParticipantStatus,
} from "@/lib/blitzrunde";
import type {
  AdminRoundSummary,
  AdminRoundView,
  DeckPreview,
  ParticipantView,
} from "@/lib/blitzrunde-store";

export type AdminClassProgress = ClassProgress & { names: Record<string, string> };

export type BlitzrundeLevelOption = {
  slug: string;
  label: string;
  chapters: { slug: string; label: string }[];
};

const POLL_MS = 2000;

const KIND_LABEL: Record<BlitzrundeKind, string> = {
  order: "Sentence order",
  "multiple-choice": "Multiple choice",
  "vi-choice": "Vietnamese → German choice",
  "vi-input": "Vietnamese → type German",
  pairing: "Pairing",
};

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  waiting: "In lobby",
  playing: "Playing",
  finished: "Finished",
  disconnected: "Disconnected",
  no_result: "No result",
};

const STATUS_TONE: Record<ParticipantStatus, string> = {
  waiting: "bg-surface-container-high text-on-surface-variant",
  playing: "bg-primary-fixed text-on-primary-fixed",
  finished: "bg-[#34C759]/15 text-[#1f7a3a]",
  disconnected: "bg-error-container text-on-error-container",
  no_result: "bg-surface-container-high text-on-surface-variant",
};

const SELECT =
  "h-10 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-space-12 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary";
const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-space-8 rounded-xl bg-primary px-space-16 font-label-md text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const SECONDARY =
  "inline-flex h-10 items-center justify-center gap-space-8 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-space-16 font-label-md text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40";

function formatWhen(iso: string | null): string {
  return formatAdminTimestamp(iso) ?? "—";
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}s`;
}

function isLive(status: string): boolean {
  return status === "lobby" || status === "active";
}

/** Phones upload after the teacher ends. Keep reading until that window closes or every result is in. */
function resultsStillOpen(round: AdminRoundView | null, selectedId: string | null): boolean {
  if (!round || round.meta.id !== selectedId || round.meta.status !== "ended" || !round.meta.endedAt) return false;
  if (round.participants.every((participant) => participant.submittedAt)) return false;
  const ended = Date.parse(round.meta.endedAt);
  if (!Number.isFinite(ended)) return false;
  return Date.now() - ended < LATE_SUBMIT_MS;
}

function cardSummary(card: BlitzrundeCard | undefined): string {
  if (!card) return "—";
  if (card.kind === "order") return card.translationVi;
  if (card.kind === "multiple-choice" || card.kind === "vi-choice" || card.kind === "vi-input") return card.prompt;
  return card.items.map((item) => item.de).join(" · ");
}

function answerSummary(answer: AnswerRecord, card: BlitzrundeCard | undefined): string {
  if (answer.kind === "order" && Array.isArray(answer.answer)) return answer.answer.join(" ");
  if (
    (answer.kind === "multiple-choice" || answer.kind === "vi-choice") &&
    typeof answer.answer === "string" &&
    card &&
    (card.kind === "multiple-choice" || card.kind === "vi-choice")
  ) {
    return card.options.find((option) => option.id === answer.answer)?.text ?? answer.answer;
  }
  if (answer.kind === "vi-input" && typeof answer.answer === "string") return answer.answer;
  if (answer.kind === "pairing" && typeof answer.answer === "number") {
    return answer.answer === 0 ? "No wrong pairs" : `${answer.answer} wrong pair${answer.answer === 1 ? "" : "s"}`;
  }
  return "—";
}

function roundStatusLabel(round: { status: string; endedReason: string | null; ranked: boolean }): string {
  if (round.status === "lobby") return "Lobby open";
  if (round.status === "active") return "Running";
  if (round.status === "cancelled") return "Cancelled";
  const reason = round.endedReason === "teacher_ended" ? "ended early" : "time up";
  return `${round.ranked ? "Finished" : "Practice"} · ${reason}`;
}

function Banner({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  const style =
    tone === "error"
      ? "border-error-container bg-error-container/40 text-on-error-container"
      : "border-outline-variant/30 bg-surface-container text-on-surface-variant";
  return (
    <div className={`rounded-2xl border px-space-20 py-space-16 font-body-sm text-body-sm ${style}`}>{children}</div>
  );
}

function Card({ title, hint, children, trailing }: { title: string; hint?: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-space-12 px-space-16 py-space-12">
        <div>
          <h2 className="font-label-md text-label-md font-semibold text-on-surface">{title}</h2>
          {hint ? <p className="mt-0.5 font-caption text-caption text-on-surface-variant">{hint}</p> : null}
        </div>
        {trailing}
      </div>
      <div className="px-space-16 pb-space-16">{children}</div>
    </section>
  );
}

function DeckCounts({ total, counts }: { total: number; counts: Record<BlitzrundeKind, number> }) {
  return (
    <p className="font-body-sm text-body-sm text-on-surface-variant">
      <span className="font-semibold text-on-surface tabular-nums">{total}</span> cards ·{" "}
      {(Object.keys(KIND_LABEL) as BlitzrundeKind[])
        .map((kind) => `${counts[kind]} ${KIND_LABEL[kind].toLowerCase()}`)
        .join(" · ")}
    </p>
  );
}

function CreateRound({
  classes,
  levels,
  disabled,
  onCreated,
}: {
  classes: AdminClassOption[];
  levels: BlitzrundeLevelOption[];
  disabled: boolean;
  onCreated: (id: string) => void;
}) {
  const [classLabel, setClassLabel] = useState(classes[0]?.label ?? "");
  const [levelSlug, setLevelSlug] = useState(levels[0]?.slug ?? "");
  const chapters = levels.find((level) => level.slug === levelSlug)?.chapters ?? [];
  const [chapterSlug, setChapterSlug] = useState(chapters[0]?.slug ?? "");
  const [preview, setPreview] = useState<{ key: string; value: DeckPreview | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewKey = `${levelSlug}/${chapterSlug}`;
  useEffect(() => {
    if (!levelSlug || !chapterSlug) return;
    let cancelled = false;
    void previewBlitzrundeDeck(levelSlug, chapterSlug).then((result) => {
      if (!cancelled) setPreview({ key: `${levelSlug}/${chapterSlug}`, value: result.ok ? result.value : null });
    });
    return () => {
      cancelled = true;
    };
  }, [levelSlug, chapterSlug]);
  const current = preview?.key === previewKey ? preview.value : undefined;
  const classCount = classes.find((option) => option.label === classLabel)?.count ?? 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    const result = await createBlitzrunde({ classLabel, levelSlug, chapterSlug });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.value.id);
  };

  if (classes.length === 0) {
    return (
      <Card title="Open a round">
        <Banner tone="info">
          No classes yet. Assign students to a class on the Classes page, then come back here.
        </Banner>
      </Card>
    );
  }

  return (
    <Card
      title="Open a round"
      hint="Pick the class and the Lektion you just taught. Students of that class see a join banner on their home screen."
    >
      <div className="grid gap-space-12 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant">Class</span>
          <select className={SELECT} value={classLabel} onChange={(event) => setClassLabel(event.target.value)}>
            {classes.map((option) => (
              <option key={option.key} value={option.label}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant">Level</span>
          <select
            className={SELECT}
            value={levelSlug}
            onChange={(event) => {
              const next = event.target.value;
              setLevelSlug(next);
              setChapterSlug(levels.find((level) => level.slug === next)?.chapters[0]?.slug ?? "");
            }}
          >
            {levels.map((level) => (
              <option key={level.slug} value={level.slug}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant">Lektion</span>
          <select className={SELECT} value={chapterSlug} onChange={(event) => setChapterSlug(event.target.value)}>
            {chapters.map((chapter) => (
              <option key={chapter.slug} value={chapter.slug}>
                {chapter.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-space-12 flex flex-wrap items-center justify-between gap-space-12">
        <div className="min-w-0">
          {current === undefined ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">Counting cards…</p>
          ) : current ? (
            <>
              <DeckCounts total={current.total} counts={current.counts} />
              {current.total === 0 ? (
                <p className="mt-1 font-caption text-caption text-error">No usable cards in this Lektion.</p>
              ) : current.total < THIN_DECK_WARNING ? (
                <p className="mt-1 font-caption text-caption text-error">
                  Short deck — fast students will finish well before the 7 minutes are up.
                </p>
              ) : null}
            </>
          ) : null}
          {classCount < MIN_RANKED ? (
            <p className="mt-1 font-caption text-caption text-on-surface-variant">
              This class has fewer than {MIN_RANKED} students, so the round can only run unranked.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className={PRIMARY}
          disabled={disabled || busy || !classLabel || !chapterSlug || current?.total === 0}
          onClick={() => void create()}
        >
          <MaterialIcon name={BLITZRUNDE_ICON} className="text-[18px]" />
          {busy ? "Opening…" : "Open lobby"}
        </button>
      </div>
      {error ? <p className="mt-space-8 font-body-sm text-body-sm text-error">{error}</p> : null}
    </Card>
  );
}

function ParticipantRow({
  participant,
  deckSize,
  showProgress,
  answers,
  deck,
  expanded,
  onToggle,
}: {
  participant: ParticipantView;
  deckSize: number;
  showProgress: boolean;
  answers: AnswerRecord[];
  deck: BlitzrundeCard[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const finished = participant.submittedAt != null;
  const progress = finished
    ? `${participant.answered}/${deckSize}`
    : participant.lastSeenIndex != null
      ? `${participant.lastSeenIndex}/${deckSize}`
      : "—";
  return (
    <Fragment>
      <tr className="border-t border-outline-variant/20">
        <td className="py-space-8 pr-space-8 tabular-nums text-on-surface-variant">{participant.rank ?? "—"}</td>
        <td className="py-space-8 pr-space-8 font-semibold text-on-surface">{participant.name}</td>
        <td className="py-space-8 pr-space-8">
          <span className={`inline-flex rounded-full px-2 py-0.5 font-caption text-caption font-semibold ${STATUS_TONE[participant.status]}`}>
            {STATUS_LABEL[participant.status]}
          </span>
        </td>
        {showProgress ? <td className="py-space-8 pr-space-8 tabular-nums">{progress}</td> : null}
        <td className="py-space-8 pr-space-8 text-right tabular-nums font-semibold text-on-surface">
          {finished ? participant.finalScore.toLocaleString("en-GB") : "—"}
        </td>
        <td className="py-space-8 pr-space-8 text-right tabular-nums">
          {finished ? `${participant.correct}/${participant.answered}` : "—"}
        </td>
        <td className="py-space-8 pr-space-8 text-right tabular-nums">
          {finished && participant.answered > 0 ? formatSeconds(participant.avgMs) : "—"}
        </td>
        <td className="py-space-8 pr-space-8 text-right tabular-nums">{finished ? participant.longestStreak : "—"}</td>
        <td className="py-space-8 text-right">
          {answers.length > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              className="font-label-sm text-label-sm font-semibold text-primary hover:underline"
            >
              {expanded ? "Hide" : "Answers"}
            </button>
          ) : null}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={showProgress ? 9 : 8} className="pb-space-12">
            <div className="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-low">
              <table className="w-full min-w-[640px] font-caption text-caption">
                <thead className="text-left text-on-surface-variant">
                  <tr>
                    <th className="px-space-8 py-1.5 font-semibold">#</th>
                    <th className="px-space-8 py-1.5 font-semibold">Card</th>
                    <th className="px-space-8 py-1.5 font-semibold">Prompt</th>
                    <th className="px-space-8 py-1.5 font-semibold">Answer</th>
                    <th className="px-space-8 py-1.5 text-right font-semibold">Accuracy</th>
                    <th className="px-space-8 py-1.5 text-right font-semibold">Time</th>
                    <th className="px-space-8 py-1.5 text-right font-semibold">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {answers.map((answer) => {
                    const card = deck[answer.position];
                    return (
                      <tr key={answer.position} className="border-t border-outline-variant/20 text-on-surface">
                        <td className="px-space-8 py-1.5 tabular-nums">{answer.position + 1}</td>
                        <td className="px-space-8 py-1.5">{KIND_LABEL[answer.kind]}</td>
                        <td className="max-w-[220px] truncate px-space-8 py-1.5">{cardSummary(card)}</td>
                        <td className="max-w-[220px] truncate px-space-8 py-1.5">{answerSummary(answer, card)}</td>
                        <td
                          className={`px-space-8 py-1.5 text-right tabular-nums ${
                            answer.accuracy === 100 ? "text-[#1f7a3a]" : answer.accuracy === 0 ? "text-error" : ""
                          }`}
                        >
                          {answer.accuracy}%
                        </td>
                        <td className="px-space-8 py-1.5 text-right tabular-nums">{formatSeconds(answer.timeMs)}</td>
                        <td className="px-space-8 py-1.5 text-right tabular-nums">{answer.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function RoundPanel({
  round,
  now,
  onChanged,
  onClose,
}: {
  round: AdminRoundView;
  now: number;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { meta, participants } = round;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const joined = participants.length;

  const act = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.error);
    onChanged();
  };

  const finished = participants.filter((participant) => participant.submittedAt).length;
  const live = meta.status === "active";

  return (
    <Card
      title={`${meta.classLabel} · ${meta.levelLabel} ${meta.lektionLabel}`}
      hint={`${roundStatusLabel(meta)} · opened ${formatWhen(meta.createdAt)}${meta.status !== "lobby" && meta.status !== "cancelled" ? (meta.ranked ? " · ranked" : " · unranked practice") : ""}`}
      trailing={
        <button type="button" onClick={onClose} className="text-on-surface-variant hover:text-on-surface" aria-label="Close">
          <MaterialIcon name="close" className="text-[20px]" />
        </button>
      }
    >
      <DeckCounts total={meta.deckSize} counts={meta.counts} />

      <div className="mt-space-12 flex flex-wrap items-center gap-space-12">
        {meta.status === "lobby" ? (
          <>
            <p className="font-body-md text-body-md text-on-surface">
              <span className="font-semibold tabular-nums">{joined}</span> joined
            </p>
            <button
              type="button"
              className={PRIMARY}
              disabled={busy || joined === 0}
              onClick={() => void act(() => startBlitzrunde(meta.id))}
            >
              <MaterialIcon name="play_arrow" className="text-[18px]" />
              {joined >= MIN_RANKED ? "Start round" : "Start unranked practice"}
            </button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={() => void act(() => cancelBlitzrunde(meta.id))}>
              Cancel
            </button>
            {joined > 0 && joined < MIN_RANKED ? (
              <p className="font-caption text-caption text-on-surface-variant">
                With fewer than {MIN_RANKED} students the round does not count on the Blitzrunde board.
              </p>
            ) : null}
          </>
        ) : null}
        {live ? (
          <>
            <p className="font-headline-md text-headline-md tabular-nums text-on-surface">
              {formatRemaining(remainingMs(meta.endsAt, now))}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {finished}/{joined} finished
            </p>
            <button type="button" className={PRIMARY} disabled={busy} onClick={() => void act(() => endBlitzrunde(meta.id))}>
              <MaterialIcon name="stop" className="text-[18px]" />
              End now
            </button>
          </>
        ) : null}
      </div>
      {error ? <p className="mt-space-8 font-body-sm text-body-sm text-error">{error}</p> : null}

      {participants.length > 0 ? (
        <div className="mt-space-16 overflow-x-auto">
          <table className="w-full min-w-[640px] font-body-sm text-body-sm">
            <thead className="text-left font-label-sm text-label-sm text-on-surface-variant">
              <tr>
                <th className="pb-space-8 pr-space-8 font-semibold">Rank</th>
                <th className="pb-space-8 pr-space-8 font-semibold">Student</th>
                <th className="pb-space-8 pr-space-8 font-semibold">Status</th>
                {live ? <th className="pb-space-8 pr-space-8 font-semibold">Card</th> : null}
                <th className="pb-space-8 pr-space-8 text-right font-semibold">Points</th>
                <th className="pb-space-8 pr-space-8 text-right font-semibold">Correct</th>
                <th className="pb-space-8 pr-space-8 text-right font-semibold">Avg time</th>
                <th className="pb-space-8 pr-space-8 text-right font-semibold">Best streak</th>
                <th className="pb-space-8" />
              </tr>
            </thead>
            <tbody className="text-on-surface-variant">
              {participants.map((participant) => (
                <ParticipantRow
                  key={participant.userId}
                  participant={participant}
                  deckSize={meta.deckSize}
                  showProgress={live}
                  answers={round.answers[participant.userId] ?? []}
                  deck={round.deck}
                  expanded={expanded === participant.userId}
                  onToggle={() => setExpanded((current) => (current === participant.userId ? null : participant.userId))}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : meta.status === "lobby" ? (
        <p className="mt-space-12 font-body-sm text-body-sm text-on-surface-variant">
          Waiting for students to tap “Tham gia” on their home screen…
        </p>
      ) : null}
    </Card>
  );
}

function History({
  rounds,
  selectedId,
  onSelect,
}: {
  rounds: AdminRoundSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rounds.length === 0) {
    return (
      <Card title="Past rounds">
        <p className="font-body-sm text-body-sm text-on-surface-variant">No rounds yet.</p>
      </Card>
    );
  }
  return (
    <Card title="Past rounds" hint="Newest first. Pick a round to see every student's answers.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] font-body-sm text-body-sm">
          <thead className="text-left font-label-sm text-label-sm text-on-surface-variant">
            <tr>
              <th className="pb-space-8 pr-space-8 font-semibold">When</th>
              <th className="pb-space-8 pr-space-8 font-semibold">Class</th>
              <th className="pb-space-8 pr-space-8 font-semibold">Lektion</th>
              <th className="pb-space-8 pr-space-8 font-semibold">Status</th>
              <th className="pb-space-8 pr-space-8 text-right font-semibold">Finished</th>
              <th className="pb-space-8 font-semibold">Winner</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <tr
                key={round.id}
                onClick={() => onSelect(round.id)}
                className={`cursor-pointer border-t border-outline-variant/20 text-on-surface-variant hover:bg-surface-container ${
                  round.id === selectedId ? "bg-surface-container" : ""
                }`}
              >
                <td className="py-space-8 pr-space-8 tabular-nums">{formatWhen(round.createdAt)}</td>
                <td className="py-space-8 pr-space-8 text-on-surface">{round.classLabel}</td>
                <td className="py-space-8 pr-space-8">
                  {round.levelLabel} {round.lektionLabel}
                </td>
                <td className="py-space-8 pr-space-8">{roundStatusLabel(round)}</td>
                <td className="py-space-8 pr-space-8 text-right tabular-nums">
                  {round.finishedCount}/{round.joinedCount}
                </td>
                <td className="py-space-8">
                  {round.winnerName ? (
                    <span className="text-on-surface">
                      {round.winnerName}{" "}
                      <span className="tabular-nums text-on-surface-variant">
                        ({(round.winnerScore ?? 0).toLocaleString("en-GB")})
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ClassProgressSection({ progress }: { progress: AdminClassProgress[] }) {
  const [classKey, setClassKey] = useState(progress[0]?.classKey ?? "");
  const current = progress.find((entry) => entry.classKey === classKey) ?? progress[0];
  if (!current) {
    return (
      <Card title="Class progress">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Charts appear after a class has finished a ranked round (2+ students).
        </p>
      </Card>
    );
  }
  const leftCount = current.series.filter((line) => !line.member).length;
  return (
    <Card
      title="Class progress"
      hint={`Running total of Blitzrunde points per student, one point per ranked round (newest ${current.rounds.length}, by date). Points stay in the class they were earned in${leftCount > 0 ? "; students who moved away stop at their last round here" : ""}. Tap a name to highlight it.`}
      trailing={
        progress.length > 1 ? (
          <select
            className="h-9 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-space-12 font-body-sm text-body-sm text-on-surface"
            value={current.classKey}
            onChange={(event) => setClassKey(event.target.value)}
            aria-label="Class"
          >
            {progress.map((entry) => (
              <option key={entry.classKey} value={entry.classKey}>
                {entry.classLabel}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-label-md text-label-md font-semibold text-on-surface">{current.classLabel}</span>
        )
      }
    >
      {current.rounds.length < 2 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Only one ranked round so far — the line chart starts with the second round.
        </p>
      ) : (
        <BlitzrundeProgressChart
          key={current.classKey}
          rounds={current.rounds}
          series={current.series}
          names={current.names}
          variant="admin"
          height={300}
        />
      )}
    </Card>
  );
}

export function AdminBlitzrunde({
  classes,
  levels,
  initialRounds,
  roundsReady,
  schemaHint,
  storeConfigured,
  progress,
}: {
  classes: AdminClassOption[];
  levels: BlitzrundeLevelOption[];
  initialRounds: AdminRoundSummary[];
  roundsReady: boolean;
  schemaHint?: string;
  storeConfigured: boolean;
  progress: AdminClassProgress[];
}) {
  const [rounds, setRounds] = useState(initialRounds);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialRounds.find((round) => isLive(round.status))?.id ?? null,
  );
  const [round, setRound] = useState<AdminRoundView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshRounds = useCallback(() => {
    void listBlitzrundeRounds().then((result) => {
      if (result.ok) setRounds(result.value.rounds);
    });
  }, []);

  const selectedStatus = round?.meta.id === selectedId ? round.meta.status : null;
  const polling = selectedStatus == null || isLive(selectedStatus) || resultsStillOpen(round, selectedId);
  const submittedCount =
    round && round.meta.id === selectedId
      ? round.participants.filter((participant) => participant.submittedAt).length
      : 0;

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = () => {
      void getBlitzrundeAdminRound(selectedId).then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setRound(result.value);
          setLoadError(null);
        } else {
          setLoadError(result.error);
        }
      });
    };
    load();
    if (!polling) return () => {
      cancelled = true;
    };
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedId, polling, refreshTick]);

  useEffect(() => {
    if (selectedStatus !== "active") return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 500);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [selectedStatus]);

  // History (winner, finished count) updates when the round closes and again as late results arrive.
  useEffect(() => {
    if (selectedStatus && !isLive(selectedStatus)) refreshRounds();
  }, [selectedStatus, submittedCount, refreshRounds]);

  const liveRound = useMemo(() => rounds.find((entry) => isLive(entry.status)), [rounds]);
  const shown = round && round.meta.id === selectedId ? round : null;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Engagement"
        title="Blitzrunde"
        subtitle="A 7-minute class quiz on one Lektion: sentence order, multiple choice and pairing, no audio. Everyone gets the same shuffled deck; points reward accuracy, speed and streaks. Rounds with 2+ students count on the Blitzrunde leaderboard (not XP)."
      />

      {!storeConfigured ? (
        <Banner tone="error">Cloud progress is not configured, so rounds cannot be stored.</Banner>
      ) : !roundsReady ? (
        <Banner tone="error">{schemaHint ?? "The Blitzrunde tables are missing. Run supabase/blitzrunde.sql once in Supabase."}</Banner>
      ) : null}

      {shown ? (
        <RoundPanel
          round={shown}
          now={now}
          onChanged={() => {
            setRefreshTick((tick) => tick + 1);
            refreshRounds();
          }}
          onClose={() => setSelectedId(null)}
        />
      ) : selectedId && loadError ? (
        <Banner tone="error">{loadError}</Banner>
      ) : null}

      {!shown || !isLive(shown.meta.status) ? (
        <CreateRound
          classes={classes}
          levels={levels}
          disabled={!storeConfigured || !roundsReady}
          onCreated={(id) => {
            setSelectedId(id);
            refreshRounds();
          }}
        />
      ) : null}

      {liveRound && liveRound.id !== selectedId ? (
        <Banner tone="info">
          {liveRound.classLabel} has an open round.{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setSelectedId(liveRound.id)}>
            Open it
          </button>
        </Banner>
      ) : null}

      <ClassProgressSection progress={progress} />

      <History rounds={rounds} selectedId={selectedId} onSelect={setSelectedId} />
    </main>
  );
}
