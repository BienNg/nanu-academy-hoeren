"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  deleteDifficultyCohort,
  deletePartChange,
  loadClipBehavior,
  saveDifficultyCohort,
  savePartChange,
} from "@/app/admin/content/clips/actions";
import { MaterialIcon } from "@/components/admin/AdminShell";
import {
  Badge,
  Button,
  CARD,
  Checkbox,
  Dialog,
  HeaderChip,
  INPUT,
  KpiTile,
  ScopeChips,
  SectionHeading,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { describeCatalogClip, type AdminCatalogCourse } from "@/lib/admin-detail";
import { classKey } from "@/lib/admin-overview";
import type {
  ChangeWindowStats,
  ClipBehaviorData,
  DifficultyCohort,
  PartRow,
  PartStats,
} from "@/lib/part-difficulty";

/* ------------------------------------------------------------------ */
/* Formatting and cell tones                                           */
/* ------------------------------------------------------------------ */

type Tone = "hard" | "watch" | "healthy" | "easy" | "none";

const TONE_CELL: Record<Tone, string> = {
  hard: "bg-admin-crimson-wash text-admin-crimson",
  watch: "bg-admin-amber-wash text-admin-amber",
  healthy: "bg-admin-emerald-wash text-admin-emerald",
  easy: "bg-admin-cobalt-wash text-admin-cobalt",
  none: "text-admin-ink-muted",
};

const TONE_ICON: Record<Tone, string | null> = {
  hard: "arrow_upward",
  watch: "priority_high",
  healthy: null,
  easy: "arrow_downward",
  none: null,
};

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function seconds(ms: number | null): string {
  if (ms == null) return "—";
  const value = ms / 1000;
  return value < 10 ? `${value.toFixed(1)}s` : `${Math.round(value)}s`;
}

function minutes(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 60_000).toFixed(1)} min`;
}

function signedPoints(value: number | null): string {
  if (value == null) return "—";
  const points = Math.round(value * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
}

function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function todayVietnam(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function partTitle(row: Pick<PartRow, "courseLabel" | "lessonLabel" | "partNumber">): string {
  return `${row.courseLabel} · ${row.lessonLabel} · Part ${row.partNumber}`;
}

/** Each column's own sample: below the minimum it is shown greyed and never coloured. */
function cellTones(row: PartRow, min: number): Record<string, Tone> {
  const s = row.stats;
  const tones: Record<string, Tone> = {};
  if (s.learners < min) return tones;
  if (s.firstTryAccuracy != null && s.firstTry >= min) {
    const v = s.firstTryAccuracy;
    tones.accuracy = v < 0.6 ? "hard" : v > 0.95 ? "easy" : v >= 0.75 && v <= 0.9 ? "healthy" : "watch";
    if (row.neighbor.accuracy != null && row.neighbor.accuracy <= -0.15) tones.accuracy = "hard";
  }
  if (s.heavyRetry != null && s.firstTry >= min) {
    tones.retry = s.heavyRetry >= 0.2 ? "hard" : s.heavyRetry >= 0.1 ? "watch" : "none";
  }
  if (s.firstTryPass != null && s.firstTry >= min && s.firstTryPass >= 0.98 && (s.firstTryAccuracy ?? 0) > 0.9) {
    tones.pass = "easy";
  }
  if (s.failRate != null && row.neighbor.fail != null && row.neighbor.fail >= 0.15) tones.fail = "hard";
  if (s.abandonRate != null && s.starts >= min) {
    tones.abandon = s.abandonRate >= 0.25 ? "hard" : s.abandonRate >= 0.15 ? "watch" : "none";
    if (row.neighbor.abandon != null && row.neighbor.abandon >= 0.15) tones.abandon = "hard";
  }
  if (s.quitAfterFail != null && s.failsEligible >= min) {
    tones.quit = s.quitAfterFail >= 0.3 ? "hard" : s.quitAfterFail >= 0.15 ? "watch" : "none";
  }
  if (s.timeRatio != null && s.passedLearners >= min) {
    tones.time = s.timeRatio >= 1.5 ? "hard" : s.timeRatio <= 0.6 ? "easy" : "none";
  }
  if (s.binge != null && s.passedLearners >= min && s.binge >= 0.5) tones.binge = "easy";
  if (row.flags.some((flag) => flag.code === "behind-pace")) tones.behind = "hard";
  const worst = s.worstClips[0];
  if (worst) tones.clip = worst.missRate >= 0.5 ? "hard" : worst.missRate >= 0.3 ? "watch" : "none";
  return tones;
}

const VERDICT: Record<PartRow["verdict"], { label: string; tone: "crimson" | "cobalt" | "amber" | "emerald" | "neutral"; icon: string }> = {
  "too-hard": { label: "Too hard", tone: "crimson", icon: "trending_up" },
  "too-easy": { label: "Too easy", tone: "cobalt", icon: "trending_down" },
  mixed: { label: "Mixed", tone: "amber", icon: "swap_vert" },
  healthy: { label: "Healthy", tone: "emerald", icon: "check" },
  thin: { label: "Few students", tone: "neutral", icon: "hourglass_empty" },
};

function VerdictBadge({ verdict }: { verdict: PartRow["verdict"] }) {
  const meta = VERDICT[verdict];
  return (
    <Badge tone={meta.tone}>
      <MaterialIcon name={meta.icon} className="text-[14px]" />
      {meta.label}
    </Badge>
  );
}

function HeatCell({
  tone = "none",
  value,
  title,
  muted,
}: {
  tone?: Tone;
  value: string;
  title: string;
  muted?: boolean;
}) {
  const icon = TONE_ICON[tone];
  return (
    <td className="px-space-4 py-space-4 text-center">
      <span
        title={title}
        className={`inline-flex h-8 min-w-[3.25rem] items-center justify-center gap-0.5 rounded-admin-badge px-space-8 text-admin-label-md font-semibold tabular-nums ${
          muted ? "text-admin-ink-faint" : TONE_CELL[tone]
        }`}
      >
        {icon && !muted ? <MaterialIcon name={icon} className="text-[13px]" /> : null}
        {value}
      </span>
    </td>
  );
}

function Notice({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div
      className={`${CARD} flex items-start gap-space-12 border-l-2 p-space-16 ${
        tone === "error" ? "border-l-admin-crimson" : "border-l-admin-cobalt"
      }`}
    >
      <MaterialIcon
        name={tone === "error" ? "error" : "info"}
        className={`mt-0.5 text-[18px] ${tone === "error" ? "text-admin-crimson" : "text-admin-cobalt"}`}
      />
      <div className="text-admin-body-md text-admin-ink">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cohort manager                                                      */
/* ------------------------------------------------------------------ */

type CohortDraft = { id: string | null; name: string; classes: string[] };

function CohortManager({
  open,
  onClose,
  cohorts,
  classes,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  cohorts: readonly DifficultyCohort[];
  classes: ClipBehaviorData["classes"];
  onChanged: (selectId?: string | null) => void;
}) {
  const [draft, setDraft] = useState<CohortDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setDraft(null);
    setError(null);
    onClose();
  };

  const draftKeys = new Set((draft?.classes ?? []).map((name) => classKey(name)));
  // Classes saved on a cohort but with no students now still show, so they can be removed.
  const options = [
    ...classes,
    ...(draft?.classes ?? [])
      .filter((name) => !classes.some((option) => option.key === classKey(name)))
      .map((name) => ({ key: classKey(name), label: name, count: 0 })),
  ];

  const toggle = (label: string, key: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      classes: draftKeys.has(key)
        ? draft.classes.filter((name) => classKey(name) !== key)
        : [...draft.classes, label],
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const result = await saveDifficultyCohort(draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(null);
    onChanged(result.value.id);
  };

  const remove = async (cohort: DifficultyCohort) => {
    if (!window.confirm(`Delete the cohort "${cohort.name}"? Students and classes are not changed.`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteDifficultyCohort(cohort.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged(null);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={draft ? (draft.id ? "Edit cohort" : "New cohort") : "Cohorts"}
      description={
        draft
          ? "A cohort is one or more classes. Students without a class only appear under All students."
          : "Saved for every admin. The Behavior tab shows one cohort at a time."
      }
      actions={
        draft ? (
          <>
            <Button onClick={() => setDraft(null)} disabled={busy}>
              Back
            </Button>
            <Button
              variant="primary"
              icon="save"
              onClick={save}
              disabled={busy || !draft.name.trim() || draft.classes.length === 0}
            >
              {busy ? "Saving…" : "Save cohort"}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={close}>Close</Button>
            <Button variant="primary" icon="add" onClick={() => setDraft({ id: null, name: "", classes: [] })}>
              New cohort
            </Button>
          </>
        )
      }
    >
      {error ? <p className="mb-space-12 text-admin-body-sm text-admin-crimson">{error}</p> : null}
      {draft ? (
        <div className="flex flex-col gap-space-16">
          <label className="flex flex-col gap-space-4">
            <span className="text-admin-label-md font-semibold text-admin-ink">Name</span>
            <input
              className={INPUT}
              value={draft.name}
              maxLength={80}
              placeholder="e.g. Spring 2026"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <fieldset className="flex flex-col gap-space-8">
            <legend className="mb-space-4 text-admin-label-md font-semibold text-admin-ink">
              Classes · {draft.classes.length} picked
            </legend>
            {options.length === 0 ? (
              <p className="text-admin-body-sm text-admin-ink-muted">No student has a class yet.</p>
            ) : (
              <div className="grid max-h-64 grid-cols-1 gap-space-4 overflow-y-auto sm:grid-cols-2">
                {options.map((option) => (
                  <label
                    key={option.key}
                    className="flex cursor-pointer items-center gap-space-8 rounded-admin-control px-space-8 py-space-4 hover:bg-admin-subtle"
                  >
                    <Checkbox
                      checked={draftKeys.has(option.key)}
                      onChange={() => toggle(option.label, option.key)}
                    />
                    <span className="min-w-0 flex-1 truncate text-admin-body-md text-admin-ink">{option.label}</span>
                    <span className="text-admin-label-sm tabular-nums text-admin-ink-subtle">{option.count}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
      ) : cohorts.length === 0 ? (
        <p className="text-admin-body-md text-admin-ink-muted">No cohorts yet. Create one from your classes.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-admin-hairline">
          {cohorts.map((cohort) => (
            <li key={cohort.id} className="flex items-center gap-space-12 py-space-8">
              <span className="min-w-0 flex-1">
                <span className="block text-admin-body-md font-semibold text-admin-ink">{cohort.name}</span>
                <span className="block truncate text-admin-body-sm text-admin-ink-muted">
                  {cohort.classes.join(", ")}
                </span>
              </span>
              <Button
                variant="ghost"
                icon="edit"
                aria-label={`Edit ${cohort.name}`}
                onClick={() => setDraft({ id: cohort.id, name: cohort.name, classes: [...cohort.classes] })}
                disabled={busy}
              />
              <Button
                variant="ghost"
                icon="delete"
                aria-label={`Delete ${cohort.name}`}
                onClick={() => remove(cohort)}
                disabled={busy}
              />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Change markers                                                      */
/* ------------------------------------------------------------------ */

function ChangeForm({
  parts,
  initialKey,
  onSaved,
  onCancel,
}: {
  parts: readonly PartRow[];
  initialKey: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(initialKey ?? parts[0]?.key ?? "");
  const [changedOn, setChangedOn] = useState(todayVietnam());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const row = parts.find((part) => part.key === key);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    const result = await savePartChange({
      lessonKey: row.lessonKey,
      partNumber: row.partNumber,
      changedOn,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="flex flex-col gap-space-12 border-b border-admin-hairline bg-admin-canvas px-space-16 py-space-16">
      <div className="grid grid-cols-1 gap-space-12 md:grid-cols-[minmax(0,2fr)_10rem_minmax(0,3fr)]">
        <label className="flex flex-col gap-space-4">
          <span className="text-admin-label-md font-semibold text-admin-ink">Part</span>
          <select className={INPUT} value={key} onChange={(event) => setKey(event.target.value)}>
            {parts.map((part) => (
              <option key={part.key} value={part.key}>
                {partTitle(part)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-space-4">
          <span className="text-admin-label-md font-semibold text-admin-ink">Live from</span>
          <input
            type="date"
            className={INPUT}
            value={changedOn}
            max={todayVietnam()}
            onChange={(event) => setChangedOn(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-space-4">
          <span className="text-admin-label-md font-semibold text-admin-ink">What changed</span>
          <input
            className={INPUT}
            value={note}
            maxLength={500}
            placeholder="e.g. Added a hint to clip 4, split the part in two"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      {error ? <p className="text-admin-body-sm text-admin-crimson">{error}</p> : null}
      <div className="flex justify-end gap-space-8">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" icon="flag" onClick={save} disabled={busy || !row || !changedOn}>
          {busy ? "Saving…" : "Log change"}
        </Button>
      </div>
    </div>
  );
}

function compareCell(
  before: ChangeWindowStats | null,
  after: ChangeWindowStats | null,
  pick: (stats: ChangeWindowStats) => number | null,
  format: (value: number | null) => string,
  /** True when a higher value is better. */
  higherIsBetter: boolean | null,
) {
  const a = before ? pick(before) : null;
  const b = after ? pick(after) : null;
  let tone = "text-admin-ink-muted";
  if (a != null && b != null && higherIsBetter != null && Math.abs(b - a) >= 0.03) {
    const better = higherIsBetter ? b > a : b < a;
    tone = better ? "text-admin-emerald" : "text-admin-crimson";
  }
  return (
    <td className="px-space-12 py-space-12 text-right tabular-nums">
      <span className="text-admin-body-sm text-admin-ink-subtle">{format(a)}</span>
      <MaterialIcon name="arrow_forward" className="mx-1 align-middle text-[12px] text-admin-ink-faint" />
      <span className={`text-admin-body-md font-semibold ${tone}`}>{format(b)}</span>
    </td>
  );
}

/* ------------------------------------------------------------------ */
/* Tab                                                                 */
/* ------------------------------------------------------------------ */

const COLUMNS: { key: string; label: string; hint: string }[] = [
  { key: "learners", label: "Students", hint: "Students with a first-pass try or start." },
  { key: "accuracy", label: "1st-try acc.", hint: "Mean first-try accuracy of each student's first run. Healthy: 75–90%." },
  { key: "pass", label: "1st-try pass", hint: "Students whose first run passed." },
  { key: "retry", label: "3+ tries", hint: "Students who needed 3 or more tries to pass." },
  { key: "fail", label: "Fail rate", hint: "First-pass runs that ran out of hearts." },
  { key: "abandon", label: "Drop-off", hint: "Starts left before the part ended. Collected since part starts shipped." },
  { key: "quit", label: "Quit after fail", hint: "Fails followed by no study or practice for 7 days." },
  { key: "time", label: "Time / card", hint: "Median time per card on passes, against the median part." },
  { key: "binge", label: "Binge", hint: "Passes at 95%+ in under half the median time per card." },
  { key: "behind", label: "Behind pace", hint: "Behind-pace students whose open part is this one." },
  { key: "clip", label: "Worst clip", hint: "Highest first-try miss rate of a clip in this part (5+ answers)." },
];

function writeCohortParam(cohortId: string | null) {
  const url = new URL(globalThis.location.href);
  if (cohortId) url.searchParams.set("cohort", cohortId);
  else url.searchParams.delete("cohort");
  globalThis.history.replaceState(globalThis.history.state, "", `${url.pathname}${url.search}`);
}

export function AdminClipBehavior({
  catalog,
  initialCohortId,
}: {
  catalog: readonly AdminCatalogCourse[];
  initialCohortId: string | null;
}) {
  const [cohortId, setCohortId] = useState<string | null>(initialCohortId);
  const [data, setData] = useState<ClipBehaviorData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The request that last landed or failed. Old numbers stay up while the next one loads.
  const [settled, setSettled] = useState<{ key: string; failed: boolean } | null>(null);
  const requestKey = `${cohortId ?? "all"}|${reloadKey}`;
  const loading = settled?.key !== requestKey;
  const failed = !loading && settled?.failed === true;
  const [managing, setManaging] = useState(false);
  const [course, setCourse] = useState<string>("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [changeFor, setChangeFor] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const key = `${cohortId ?? "all"}|${reloadKey}`;
    loadClipBehavior(cohortId)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setSettled({ key, failed: false });
        // A deleted cohort falls back to everyone.
        if (cohortId && value.cohortId == null) {
          setCohortId(null);
          writeCohortParam(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSettled({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [cohortId, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const selectCohort = (id: string | null) => {
    setCohortId(id);
    writeCohortParam(id);
  };

  const board = data?.board ?? null;
  const min = board?.thresholds.minLearners ?? 5;

  const courseOptions = useMemo(() => {
    if (!board) return [];
    return board.courses.map((entry) => ({
      key: entry.courseId,
      label: entry.courseLabel,
      count: entry.parts,
    }));
  }, [board]);
  const activeCourse =
    courseOptions.find((option) => option.key === course)?.key ?? courseOptions[0]?.key ?? "";

  const visibleParts = useMemo(() => {
    if (!board) return [];
    return board.parts.filter(
      (row) =>
        row.courseId === activeCourse &&
        (!flaggedOnly || row.verdict === "too-hard" || row.verdict === "too-easy" || row.verdict === "mixed"),
    );
  }, [board, activeCourse, flaggedOnly]);

  const attention = useMemo(() => {
    if (!board) return [];
    return board.parts
      .filter((row) => row.flags.some((flag) => flag.tone === "hard"))
      .map((row) => ({ row, weight: row.flags.filter((flag) => flag.tone === "hard").length }))
      .sort((a, b) => b.weight - a.weight || b.row.stats.learners - a.row.stats.learners)
      .slice(0, 8)
      .map((entry) => entry.row);
  }, [board]);

  const counts = useMemo(() => {
    const parts = board?.parts ?? [];
    const sampled = parts.filter((row) => row.verdict !== "thin");
    return {
      sampled: sampled.length,
      hard: parts.filter((row) => row.verdict === "too-hard").length,
      easy: parts.filter((row) => row.verdict === "too-easy").length,
      healthy: parts.filter((row) => row.verdict === "healthy").length,
      spikes: parts.filter((row) => row.flags.some((flag) => flag.code === "spike")).length,
    };
  }, [board]);

  const cohortChips = useMemo(() => {
    const options: { key: string; label: string; count: ReactNode }[] = [
      { key: "all", label: "All students", count: data?.allLearners ?? "…" },
    ];
    for (const cohort of data?.cohorts ?? []) {
      const keys = new Set(cohort.classes.map((name) => classKey(name)));
      const size = (data?.classes ?? []).reduce((sum, entry) => sum + (keys.has(entry.key) ? entry.count : 0), 0);
      options.push({ key: cohort.id, label: cohort.name, count: size });
    }
    return options;
  }, [data]);

  const setup = data?.setup;
  const cohortsMissing = setup?.cohorts === "missing";
  const startsMissing = setup?.starts === "missing";
  const clipsMissing = setup?.clips === "missing";
  const changesMissing = setup?.changes === "missing";
  const setupMissing = cohortsMissing || startsMissing || clipsMissing || changesMissing;
  const selectedCohort = data?.cohorts.find((entry) => entry.id === cohortId) ?? null;

  return (
    <div className="flex flex-col gap-space-24">
      <div className="flex flex-wrap items-center gap-space-12">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <ScopeChips
            label="Cohort"
            icon="groups"
            ariaLabel="Cohort"
            value={cohortId ?? "all"}
            options={cohortChips}
            onSelect={(key) => selectCohort(key === "all" ? null : key)}
          />
        </div>
        <Button icon="tune" onClick={() => setManaging(true)} disabled={!data || cohortsMissing}>
          Manage cohorts
        </Button>
        {loading ? <HeaderChip icon="progress_activity">Loading…</HeaderChip> : null}
      </div>

      {failed ? (
        <Notice tone="error">
          The behavior data could not be loaded.{" "}
          <button type="button" className="font-semibold text-admin-cobalt underline" onClick={reload}>
            Try again
          </button>
        </Notice>
      ) : null}
      {data?.status === "unconfigured" ? (
        <Notice tone="error">Cloud progress is not configured. Practice runs live in Supabase.</Notice>
      ) : data?.status === "missing" ? (
        <Notice tone="info">Practice runs are not set up yet. Run supabase/listening_runs.sql.</Notice>
      ) : data?.status === "error" ? (
        <Notice tone="error">Practice runs could not be read.</Notice>
      ) : null}
      {setupMissing ? (
        <Notice tone="info">
          Run <code className="font-admin-mono">supabase/part_difficulty.sql</code> in the Supabase SQL editor.
          Until then {[
            startsMissing && "drop-off",
            clipsMissing && "per-clip errors",
            cohortsMissing && "cohorts",
            changesMissing && "change markers",
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          stay empty.
        </Notice>
      ) : board && board.startsTracked === 0 && !startsMissing ? (
        <Notice tone="info">
          Drop-off is collected from now on: every practice part that opens is logged, and a start with no finished run
          counts as left. Older history only has finished parts.
        </Notice>
      ) : null}

      {selectedCohort && data ? (
        <p className="-mt-space-12 text-admin-body-sm text-admin-ink-muted">
          {selectedCohort.name}: {selectedCohort.classes.join(", ")} · {formatCount(data.cohortSize)} students
        </p>
      ) : null}

      {board ? (
        <>
          <section aria-labelledby="behavior-glance" className="flex flex-col gap-space-12">
            <SectionHeading
              id="behavior-glance"
              icon="insights"
              title="At a glance"
              meta={`${formatCount(board.learners)} students · ${formatCount(board.runs)} finished parts`}
            />
            <div className="grid grid-cols-1 gap-space-16 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                icon="trending_up"
                label="Too hard"
                value={formatCount(counts.hard)}
                caption={`${counts.spikes} spike${counts.spikes === 1 ? "" : "s"} against neighbouring parts`}
                color={ADMIN_COLORS.crimson}
              />
              <KpiTile
                icon="trending_down"
                label="Too easy"
                value={formatCount(counts.easy)}
                caption="Near-perfect, fast, or nobody retries"
                color={ADMIN_COLORS.cobalt}
              />
              <KpiTile
                icon="check_circle"
                label="Healthy"
                value={formatCount(counts.healthy)}
                caption={`of ${formatCount(counts.sampled)} parts with ${min}+ students`}
                color={ADMIN_COLORS.emerald}
                progress={counts.sampled > 0 ? counts.healthy / counts.sampled : undefined}
              />
              <KpiTile
                icon="timer"
                label="Median time per card"
                value={seconds(board.courseMsPerCard)}
                caption="The baseline for slow and fast parts"
                color={ADMIN_COLORS.violet}
              />
            </div>
          </section>

          <section aria-labelledby="behavior-levels" className="flex flex-col gap-space-12">
            <SectionHeading
              id="behavior-levels"
              icon="stacked_bar_chart"
              title="Level check"
              meta="One bad part is a content problem. A whole course out of the 75–90% band is a level problem."
            />
            <div className="grid grid-cols-1 gap-space-12 sm:grid-cols-2 xl:grid-cols-4">
              {board.courses.map((entry) => {
                const verdict =
                  entry.verdict === "too-hard"
                    ? { label: "Level too hard", tone: "crimson" as const }
                    : entry.verdict === "too-easy"
                      ? { label: "Level too easy", tone: "cobalt" as const }
                      : entry.verdict === "healthy"
                        ? { label: "In the band", tone: "emerald" as const }
                        : { label: "Not enough data", tone: "neutral" as const };
                return (
                  <div key={entry.courseId} className={`${CARD} flex flex-col gap-space-8 p-space-16`}>
                    <div className="flex items-center justify-between gap-space-8">
                      <span className="text-admin-body-md font-semibold text-admin-ink">{entry.courseLabel}</span>
                      <Badge tone={verdict.tone}>{verdict.label}</Badge>
                    </div>
                    <span className="text-[28px] font-semibold leading-8 tabular-nums text-admin-ink">
                      {pct(entry.medianAccuracy)}
                    </span>
                    <span className="text-admin-body-sm text-admin-ink-muted">
                      Median first-try accuracy · {pct(entry.healthyShare)} of {entry.sampledParts} parts in band ·{" "}
                      {entry.hardParts} too hard · {entry.easyParts} too easy
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="behavior-attention" className="flex flex-col gap-space-12">
            <SectionHeading id="behavior-attention" icon="flag" title="Look at these first" color={ADMIN_COLORS.crimson} />
            <TablePanel
              icon="report"
              title="Parts with too-hard signals"
              hint="Most signals first. Each line is a reason; open the part in the heatmap for clips and neighbours."
              color={ADMIN_COLORS.crimson}
            >
              {attention.length === 0 ? (
                <p className="px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
                  No part has a too-hard signal with {min}+ students.
                </p>
              ) : (
                <ol>
                  {attention.map((row) => (
                    <li
                      key={row.key}
                      className="flex flex-col gap-space-4 border-t border-admin-hairline px-space-16 py-space-12 transition-colors hover:bg-admin-canvas sm:flex-row sm:items-start"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setCourse(row.courseId);
                          setFlaggedOnly(false);
                          setExpanded(row.key);
                          document.getElementById(`part-${row.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        <span className="block text-admin-body-md font-semibold text-admin-ink hover:text-admin-cobalt">
                          {partTitle(row)}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-space-4">
                          {row.flags.map((flag) => (
                            <Badge
                              key={flag.code}
                              tone={flag.tone === "hard" ? "crimson" : "cobalt"}
                              className="!h-auto max-w-full !whitespace-normal py-0.5"
                            >
                              {flag.label}
                            </Badge>
                          ))}
                        </span>
                      </button>
                      <span className="shrink-0 text-admin-body-sm tabular-nums text-admin-ink-muted">
                        {formatCount(row.stats.learners)} students
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </TablePanel>
          </section>

          <section aria-labelledby="behavior-heatmap" className="flex flex-col gap-space-12">
            <SectionHeading
              id="behavior-heatmap"
              icon="grid_on"
              title="Parts heatmap"
              meta="Compare parts with each other, not with a fixed number. Hover a cell for its meaning."
            />
            <div className="flex flex-wrap items-center gap-space-12">
              <div className="min-w-0 flex-1">
                <ScopeChips
                  label="Course"
                  icon="school"
                  ariaLabel="Course"
                  value={activeCourse}
                  options={courseOptions}
                  onSelect={(key) => {
                    setCourse(key);
                    setExpanded(null);
                  }}
                />
              </div>
              <label className="flex items-center gap-space-8 text-admin-body-md text-admin-ink-muted">
                <Checkbox checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} />
                Flagged parts only
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-space-12 text-admin-body-sm text-admin-ink-muted">
              {(
                [
                  ["hard", "Too hard signal"],
                  ["watch", "Watch"],
                  ["healthy", "Healthy band"],
                  ["easy", "Too easy signal"],
                ] as const
              ).map(([tone, label]) => (
                <span key={tone} className="inline-flex items-center gap-space-4">
                  <span className={`inline-flex h-5 w-7 items-center justify-center rounded-admin-badge ${TONE_CELL[tone]}`}>
                    {TONE_ICON[tone] ? <MaterialIcon name={TONE_ICON[tone] as string} className="text-[12px]" /> : null}
                  </span>
                  {label}
                </span>
              ))}
              <span>Grey numbers: fewer than {min} students, not judged.</span>
            </div>
            <TablePanel
              icon="table_rows"
              title="Every practice part"
              hint="First-pass tries only: replays after a pass are left out. Click a part for its clips and neighbours."
              color={ADMIN_COLORS.violet}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[66rem] border-collapse text-left">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Part</th>
                      {COLUMNS.map((column) => (
                        <th key={column.key} className={`${TH} px-space-4 text-center`} title={column.hint}>
                          {column.label}
                        </th>
                      ))}
                      <th className={`${TH} px-space-8`}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleParts.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNS.length + 2} className="px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
                          {flaggedOnly ? "No flagged parts in this course." : "No practice data for this course yet."}
                        </td>
                      </tr>
                    ) : (
                      visibleParts.map((row, index) => {
                        const tones = cellTones(row, min);
                        const s = row.stats;
                        const thin = s.learners < min;
                        const newLesson = index === 0 || visibleParts[index - 1].lessonKey !== row.lessonKey;
                        const open = expanded === row.key;
                        const worst = s.worstClips[0];
                        return (
                          <Fragment key={row.key}>
                            {newLesson ? (
                              <tr className="bg-admin-canvas">
                                <td
                                  colSpan={COLUMNS.length + 2}
                                  className="px-space-16 pb-space-4 pt-space-12 text-admin-label-sm font-semibold uppercase text-admin-ink-subtle"
                                >
                                  {row.lessonLabel}
                                </td>
                              </tr>
                            ) : null}
                            <tr id={`part-${row.key}`} className={`${TR} cursor-pointer`} onClick={() => setExpanded(open ? null : row.key)}>
                              <td className="px-space-16 py-space-8">
                                <span className="flex items-center gap-space-4 whitespace-nowrap text-admin-body-md font-semibold text-admin-ink">
                                  <MaterialIcon name={open ? "expand_less" : "expand_more"} className="text-[18px] text-admin-ink-subtle" />
                                  Part {row.partNumber}
                                </span>
                              </td>
                              <HeatCell value={formatCount(s.learners)} title={`${s.learners} students, ${s.runs} first-pass runs, ${s.replays} replays`} />
                              <HeatCell
                                tone={tones.accuracy}
                                muted={thin}
                                value={pct(s.firstTryAccuracy)}
                                title={`First-try accuracy over ${s.firstTry} first runs. Neighbours: ${signedPoints(row.neighbor.accuracy)}`}
                              />
                              <HeatCell tone={tones.pass} muted={thin} value={pct(s.firstTryPass)} title={`${s.firstTry} first runs`} />
                              <HeatCell
                                tone={tones.retry}
                                muted={thin}
                                value={pct(s.heavyRetry)}
                                title={`Median tries to pass: ${s.medianTriesToPass ?? "—"}`}
                              />
                              <HeatCell
                                tone={tones.fail}
                                muted={thin}
                                value={pct(s.failRate)}
                                title={`Neighbours: ${signedPoints(row.neighbor.fail)}`}
                              />
                              <HeatCell
                                tone={tones.abandon}
                                muted={thin || s.starts < min}
                                value={pct(s.abandonRate)}
                                title={`${s.abandoned} of ${s.starts} starts left${s.quitPoint != null ? `, median at ${pct(s.quitPoint)} of the part` : ""}`}
                              />
                              <HeatCell
                                tone={tones.quit}
                                muted={thin || s.failsEligible < min}
                                value={pct(s.quitAfterFail)}
                                title={`${s.quitsAfterFail} of ${s.failsEligible} fails older than 7 days`}
                              />
                              <HeatCell
                                tone={tones.time}
                                muted={thin}
                                value={s.timeRatio == null ? "—" : `${s.timeRatio.toFixed(1)}×`}
                                title={`${seconds(s.medianMsPerCard)} per card, ${minutes(s.medianMs)} per part (median pass)`}
                              />
                              <HeatCell tone={tones.binge} muted={thin} value={pct(s.binge)} title="Share of passes" />
                              <HeatCell
                                tone={tones.behind}
                                muted={thin}
                                value={s.openHere > 0 ? `${s.behindHere}/${s.openHere}` : "—"}
                                title="Behind-pace students / students whose open part is this one"
                              />
                              <HeatCell
                                tone={tones.clip}
                                muted={thin}
                                value={worst ? pct(worst.missRate) : "—"}
                                title={worst ? `${worst.misses} misses in ${worst.answers} answers` : "No clip with 5+ answers"}
                              />
                              <td className="whitespace-nowrap px-space-8 py-space-8">
                                <VerdictBadge verdict={row.verdict} />
                              </td>
                            </tr>
                            {open ? (
                              <tr className="bg-admin-canvas">
                                <td colSpan={COLUMNS.length + 2} className="px-space-16 py-space-16">
                                  <PartDetail
                                    row={row}
                                    catalog={catalog}
                                    onLogChange={() => setChangeFor(row.key)}
                                    canLog={!changesMissing}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </TablePanel>
          </section>

          <section aria-labelledby="behavior-cliffs" className="flex flex-col gap-space-12">
            <SectionHeading
              id="behavior-cliffs"
              icon="stairs"
              title="Lektion to Lektion"
              meta={`Students who finished a Lektion ${board.thresholds.continueDays}+ days ago and opened the next one`}
            />
            <TablePanel
              icon="moving"
              title="Continuation"
              hint={`Under ${pct(board.thresholds.cliffRate)} is a cliff: retention drops after this Lektion.`}
              color={ADMIN_COLORS.ember}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Finished</th>
                      <th className={TH}>Next</th>
                      <th className={`${TH} text-right`}>Finishers</th>
                      <th className={`${TH} text-right`}>Continued</th>
                      <th className={TH}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.continuation.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
                          No finished Lektion is old enough to judge yet.
                        </td>
                      </tr>
                    ) : (
                      board.continuation.map((row) => (
                        <tr key={row.lessonKey} className={TR}>
                          <td className="px-space-16 py-space-12 text-admin-body-md text-admin-ink">
                            <span className="text-admin-ink-subtle">{row.courseLabel} · </span>
                            {row.lessonLabel}
                          </td>
                          <td className="px-space-16 py-space-12 text-admin-body-md text-admin-ink-muted">{row.nextLessonLabel}</td>
                          <td className="px-space-16 py-space-12 text-right tabular-nums">{formatCount(row.finishers)}</td>
                          <td className="px-space-16 py-space-12 text-right tabular-nums">{formatCount(row.continued)}</td>
                          <td className="px-space-16 py-space-12">
                            <span className="flex items-center gap-space-8">
                              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-admin-subtle">
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${Math.round((row.rate ?? 0) * 100)}%`,
                                    backgroundColor: row.cliff ? ADMIN_COLORS.crimson : ADMIN_COLORS.emerald,
                                  }}
                                />
                              </span>
                              <span className="w-10 text-admin-label-md font-semibold tabular-nums text-admin-ink">{pct(row.rate)}</span>
                              {row.cliff ? <Badge tone="crimson">Cliff</Badge> : row.finishers < min ? <Badge>Few students</Badge> : null}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TablePanel>
          </section>

          <section aria-labelledby="behavior-changes" className="flex flex-col gap-space-12">
            <SectionHeading
              id="behavior-changes"
              icon="science"
              title="Test, don't guess"
              meta={`Change one thing, then compare same-length windows before and after (up to ${board.thresholds.compareMaxDays} days each)`}
            />
            <TablePanel
              icon="flag"
              title="Content changes"
              hint="Log the day a part's change went live. Numbers follow the selected cohort."
              color={ADMIN_COLORS.cobalt}
              trailing={
                <Button
                  icon="add"
                  onClick={() => setChangeFor(null)}
                  disabled={changesMissing || board.parts.length === 0 || changeFor !== undefined}
                >
                  Log change
                </Button>
              }
            >
              {changeFor !== undefined ? (
                <ChangeForm
                  key={changeFor ?? "new"}
                  parts={board.parts}
                  initialKey={changeFor}
                  onCancel={() => setChangeFor(undefined)}
                  onSaved={() => {
                    setChangeFor(undefined);
                    reload();
                  }}
                />
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] border-collapse text-left">
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Part and change</th>
                      <th className={`${TH} text-right`}>Window</th>
                      <th className={`${TH} text-right`}>Students</th>
                      <th className={`${TH} text-right`}>1st-try acc.</th>
                      <th className={`${TH} text-right`}>1st-try pass</th>
                      <th className={`${TH} text-right`}>3+ tries</th>
                      <th className={`${TH} text-right`}>Drop-off</th>
                      <th className={`${TH} text-right`}>Time / card</th>
                      <th className={TH}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.changes.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
                          No changes logged. When you edit a suspect part, log it here to see whether it helped.
                        </td>
                      </tr>
                    ) : (
                      board.changes.map((entry) => (
                        <tr key={entry.change.id} className={TR}>
                          <td className="px-space-16 py-space-12">
                            <span className="block text-admin-body-md font-semibold text-admin-ink">
                              {entry.courseLabel} · {entry.lessonLabel} · Part {entry.change.partNumber}
                            </span>
                            <span className="block text-admin-body-sm text-admin-ink-muted">
                              {dayLabel(entry.change.changedOn)}
                              {entry.change.note ? ` · ${entry.change.note}` : ""}
                            </span>
                          </td>
                          {entry.days === 0 ? (
                            <td colSpan={7} className="px-space-16 py-space-12 text-right text-admin-body-sm text-admin-ink-muted">
                              Live today or later: check back tomorrow.
                            </td>
                          ) : (
                            <>
                              <td className="px-space-12 py-space-12 text-right text-admin-body-sm tabular-nums text-admin-ink-muted">
                                {entry.days} d each
                              </td>
                              {compareCell(entry.before, entry.after, (stats) => stats.learners, (value) => (value == null ? "—" : formatCount(value)), null)}
                              {compareCell(entry.before, entry.after, (stats) => stats.firstTryAccuracy, pct, null)}
                              {compareCell(entry.before, entry.after, (stats) => stats.firstTryPass, pct, true)}
                              {compareCell(entry.before, entry.after, (stats) => stats.heavyRetry, pct, false)}
                              {compareCell(entry.before, entry.after, (stats) => stats.abandonRate, pct, false)}
                              {compareCell(entry.before, entry.after, (stats) => stats.medianMsPerCard, seconds, null)}
                            </>
                          )}
                          <td className="px-space-8 py-space-12 text-right">
                            <Button
                              variant="ghost"
                              icon="delete"
                              aria-label="Delete this change"
                              onClick={async () => {
                                if (!window.confirm("Delete this change marker?")) return;
                                const result = await deletePartChange(entry.change.id);
                                if (!result.ok) window.alert(result.error);
                                else reload();
                              }}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TablePanel>
          </section>

          <ThresholdNotes board={board} />
        </>
      ) : null}

      {data ? (
        <CohortManager
          open={managing}
          onClose={() => setManaging(false)}
          cohorts={data.cohorts}
          classes={data.classes}
          onChanged={(selectId) => {
            if (selectId !== undefined && selectId !== null) selectCohort(selectId);
            else if (selectId === null && cohortId && !data.cohorts.some((entry) => entry.id === cohortId)) {
              selectCohort(null);
            }
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function DetailStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-admin-label-sm uppercase text-admin-ink-subtle">{label}</span>
      <span className="text-admin-body-md font-semibold tabular-nums text-admin-ink">{value}</span>
      {sub ? <span className="text-admin-body-sm text-admin-ink-muted">{sub}</span> : null}
    </div>
  );
}

function PartDetail({
  row,
  catalog,
  onLogChange,
  canLog,
}: {
  row: PartRow;
  catalog: readonly AdminCatalogCourse[];
  onLogChange: () => void;
  canLog: boolean;
}) {
  const s: PartStats = row.stats;
  return (
    <div className="sticky left-space-16 flex max-w-[min(64rem,calc(100vw-6rem))] flex-col gap-space-16">
      <div className="flex flex-wrap items-start justify-between gap-space-12">
        <div className="flex flex-wrap gap-space-4">
          {row.flags.length === 0 ? (
            <span className="text-admin-body-sm text-admin-ink-muted">
              {row.verdict === "thin" ? "Too few students to judge." : "No signal outside the starting thresholds."}
            </span>
          ) : (
            row.flags.map((flag) => (
              <Badge
                key={flag.code}
                tone={flag.tone === "hard" ? "crimson" : "cobalt"}
                className="!h-auto max-w-full !whitespace-normal py-0.5"
              >
                {flag.label}
              </Badge>
            ))
          )}
        </div>
        <Button icon="flag" onClick={onLogChange} disabled={!canLog}>
          Log a change to this part
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-space-16 sm:grid-cols-4 lg:grid-cols-6">
        <DetailStat label="Median tries to pass" value={s.medianTriesToPass == null ? "—" : String(s.medianTriesToPass)} sub={`${s.passedLearners} passed`} />
        <DetailStat label="Replays" value={formatCount(s.replays)} sub="after a pass, not judged" />
        <DetailStat label="Median pass" value={minutes(s.medianMs)} sub={`${seconds(s.medianMsPerCard)} per card`} />
        <DetailStat label="Left at" value={pct(s.quitPoint)} sub="median point in the part" />
        <DetailStat label="Vs neighbours" value={signedPoints(row.neighbor.accuracy)} sub="first-try accuracy" />
        <DetailStat label="Drop-off vs neighbours" value={signedPoints(row.neighbor.abandon)} sub={`fails ${signedPoints(row.neighbor.fail)}`} />
      </div>
      <div>
        <p className="mb-space-8 text-admin-label-sm uppercase text-admin-ink-subtle">
          Clips most often missed on the first try · {s.clipCount} clips · {s.hardClips} at 50%+ · {s.easyClips} under 2%
        </p>
        {s.worstClips.length === 0 ? (
          <p className="text-admin-body-sm text-admin-ink-muted">No clip has 5+ first-pass answers yet.</p>
        ) : (
          <ol className="flex flex-col gap-space-4">
            {s.worstClips.map((clip) => {
              const described = describeCatalogClip(catalog, row.lessonKey, clip.clipId);
              return (
                <li key={clip.clipId} className="flex items-center gap-space-12">
                  <span
                    className={`inline-flex h-7 w-14 shrink-0 items-center justify-center rounded-admin-badge text-admin-label-md font-semibold tabular-nums ${
                      clip.missRate >= 0.5 ? TONE_CELL.hard : clip.missRate >= 0.3 ? TONE_CELL.watch : TONE_CELL.none
                    }`}
                  >
                    {pct(clip.missRate)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-admin-body-md text-admin-ink" title={described.prompt}>
                    {described.prompt}
                  </span>
                  <span className="shrink-0 text-admin-body-sm tabular-nums text-admin-ink-muted">
                    {clip.misses}/{clip.answers}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function ThresholdNotes({ board }: { board: NonNullable<ClipBehaviorData["board"]> }) {
  const t = board.thresholds;
  return (
    <details className={`${CARD} p-space-16`}>
      <summary className="cursor-pointer text-admin-body-md font-semibold text-admin-ink">
        How parts are judged (starting thresholds, calibrate against your data)
      </summary>
      <ul className="mt-space-12 flex list-disc flex-col gap-space-4 pl-space-20 text-admin-body-sm text-admin-ink-muted">
        <li>Only tries up to a student&apos;s first pass count. Replays after a pass are listed but never judged.</li>
        <li>
          Too hard: first-try accuracy under {pct(t.accuracyHard)}, {pct(t.heavyRetryHard)}+ of students needing{" "}
          {t.heavyRetryTries}+ tries, a clip missed {pct(t.clipHardMiss)}+ of the time, {t.slowRatio}× the median time per
          card, {pct(t.abandonHard)}+ of starts left, {pct(t.quitAfterFailHard)}+ of fails followed by a {t.quitDays}-day
          break, or {t.behindMin}+ behind-pace students stuck on it.
        </li>
        <li>
          Too easy: first-try accuracy over {pct(t.accuracyEasy)}, almost nobody needing a second try, every clip under{" "}
          {pct(t.clipEasyMiss)} misses, {t.fastRatio}× the median time per card or less, or {pct(t.bingeEasy)}+ of passes at{" "}
          {t.bingeAccuracy}%+ in under {t.bingeSpeed}× the median time.
        </li>
        <li>
          Spike: {Math.round(t.spikeAccuracy * 100)}+ points less accurate, or {Math.round(t.spikeRate * 100)}+ points more
          drop-off or fails, than the parts either side.
        </li>
        <li>Healthy: {pct(t.healthyLow)}–{pct(t.healthyHigh)} first-try accuracy. Parts with fewer than {t.minLearners} students are not judged.</li>
        <li>
          Drop-off needs part starts, collected since part_difficulty.sql
          {board.firstStartAt ? ` (first on ${new Date(board.firstStartAt).toLocaleDateString("en-GB")})` : ""}. Everything else
          reads the full run history.
        </li>
      </ul>
    </details>
  );
}
