"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listAdminStudentClicks,
  listAdminStudentDuelClipQuits,
  listAdminStudentDuelMatchFailures,
  listAdminStudentJumpRuns,
  listAdminStudentRuns,
} from "@/app/admin/actions";
import { MaterialIcon } from "@/components/admin/AdminShell";
import { Badge, Button } from "@/components/admin/AdminUi";
import {
  ColumnHeader,
  EmptyPanel,
  Panel,
  StatStrip,
  VisitRangeSwitch,
  formatAbsoluteTime,
  shortDuration,
} from "@/components/admin/student-detail/shared";
import {
  CARD_KIND_LABEL,
  MISSED_ATTEMPT_KINDS,
  MISSED_ATTEMPT_LABEL,
  type CardKind,
} from "@/lib/card-kinds";
import {
  describeCatalogClip,
  describeCatalogLesson,
  type AdminCatalogCourse,
  type AdminVisitDetailGroup,
  type AdminVisitDetailItem,
  type AdminVisitDetailTone,
  formatVisitDay,
  type AdminVisitRange,
  type AdminVisitRow,
  type AdminVisitSignalKind,
  type AdminVisitStats,
  type projectStudentVisits,
} from "@/lib/admin-detail";
import {
  describeDuelClipQuit,
  DUEL_MATCH_FAILURE_SCHEMA_HINT,
  placeDuelClipQuits,
  type DuelClipQuit,
  type DuelMatchFailure,
  type StudentDuelMatchFailuresPage,
} from "@/lib/duels";
import {
  JUMP_RUNS_SCHEMA_HINT,
  type JumpRunOutcome,
  type StoredJumpRun,
  type StudentJumpRunsPage,
} from "@/lib/lesson-jump";
import {
  LISTENING_SCHEMA_HINT,
  placeListeningRuns,
  type StoredListeningRun,
  type StudentRunsPage,
} from "@/lib/listening-runs";
import { visitRangeIso } from "@/lib/progress";
import {
  describeVisitClick,
  placeUiClickGroups,
  summarizeUiClicks,
  UI_CLICK_ICONS,
  type StudentUiClick,
  type UiClickGroup,
} from "@/lib/ui-clicks";

type VisitCategory = AdminVisitDetailGroup["id"] | "wrong";

/** Study is curriculum (emerald), practice and video are media (violet), unfinished is amber. */
const VISIT_CATEGORY: Record<VisitCategory, { icon: string; tile: string; bar: string }> = {
  study: { icon: "menu_book", tile: "bg-admin-emerald-wash text-admin-emerald", bar: "bg-admin-emerald" },
  listening: { icon: "fitness_center", tile: "bg-admin-violet-wash text-admin-violet", bar: "bg-admin-violet" },
  left: { icon: "pending", tile: "bg-admin-amber-wash text-admin-amber", bar: "bg-admin-amber" },
  video: { icon: "play_circle", tile: "bg-admin-violet-wash text-admin-violet-ink", bar: "bg-admin-violet-soft" },
  jump: { icon: "skip_next", tile: "bg-admin-cobalt-wash text-admin-cobalt", bar: "bg-admin-cobalt" },
  wrong: { icon: "cancel", tile: "bg-admin-crimson-wash text-admin-crimson", bar: "bg-admin-crimson" },
};

const VISIT_SIGNAL: Record<AdminVisitSignalKind, { icon: string; className: string }> = {
  returning: { icon: "waving_hand", className: "bg-admin-cobalt-wash text-admin-cobalt-ink" },
  stuck: { icon: "replay", className: "bg-admin-amber-wash text-admin-amber-ink" },
  video: { icon: "videocam_off", className: "bg-admin-crimson-wash text-admin-crimson-ink" },
};

const DETAIL_TONE: Record<AdminVisitDetailTone, { icon: string; className: string }> = {
  neutral: { icon: "radio_button_unchecked", className: "text-admin-ink-faint" },
  success: { icon: "check_circle", className: "text-admin-emerald" },
  warning: { icon: "error", className: "text-admin-amber" },
};

function visitMetrics(
  stats: AdminVisitStats,
  runs: readonly StoredListeningRun[] = [],
): {
  category: VisitCategory;
  icon?: string;
  value: string;
  label: string;
}[] {
  const metrics: { category: VisitCategory; icon?: string; value: string; label: string }[] = [];
  if (stats.studyParts > 0) {
    metrics.push({
      category: "study",
      value: String(stats.studyParts),
      label: stats.studyParts === 1 ? "Study part" : "Study parts",
    });
  } else if (stats.clipsStudied > 0) {
    metrics.push({
      category: "study",
      value: String(stats.clipsStudied),
      label: stats.clipsStudied === 1 ? "Clip studied" : "Clips studied",
    });
  }
  // Finished practice parts, passed or out of hearts, from the same log as the practice list.
  // The visit's own part count only includes parts that were completed.
  if (runs.length > 0) {
    const passed = runs.filter((run) => run.outcome === "success").length;
    const failed = runs.length - passed;
    const missed = runs.reduce((sum, run) => sum + run.clips.filter((clip) => clip.missed).length, 0);
    metrics.push({
      category: "listening",
      value: String(runs.length),
      label: runs.length === 1 ? "Practice run" : "Practice runs",
    });
    if (passed > 0) {
      metrics.push({
        category: "listening",
        icon: "check_circle",
        value: String(passed),
        label: "Passed",
      });
    }
    if (failed > 0) {
      metrics.push({
        category: "listening",
        icon: "heart_broken",
        value: String(failed),
        label: "Out of hearts",
      });
    }
    if (missed > 0) {
      metrics.push({
        category: "wrong",
        value: String(missed),
        label: "Missed",
      });
    }
  } else {
    if (stats.practiceParts > 0) {
      metrics.push({
        category: "listening",
        value: String(stats.practiceParts),
        label: stats.practiceParts === 1 ? "Practice part" : "Practice parts",
      });
    } else if (stats.practiceClips > 0) {
      metrics.push({
        category: "listening",
        value: String(stats.practiceClips),
        label: stats.practiceClips === 1 ? "Practice clip" : "Practice clips",
      });
    }
    if (stats.practiceRuns > 0) {
      metrics.push({
        category: "listening",
        icon: "flag",
        value: String(stats.practiceRuns),
        label: stats.practiceRuns === 1 ? "Practice run" : "Practice runs",
      });
    }
  }
  if (stats.videoSeconds >= 1 || stats.videosWatched > 0) {
    metrics.push({
      category: "video",
      value: shortDuration(stats.videoSeconds),
      label: stats.videosWatched > 0 ? `Video · ${stats.videosWatched} watched` : "Video",
    });
  }
  if (stats.leftUnfinished > 0) {
    metrics.push({
      category: "left",
      value: String(stats.leftUnfinished),
      label: "Left unfinished",
    });
  }
  if (stats.jumps > 0) {
    const failed = stats.jumps - stats.jumpsPassed;
    let label = stats.jumps === 1 ? "Jump" : "Jumps";
    if (failed === 0) label = stats.jumps === 1 ? "Jump passed" : "Jumps passed";
    else if (stats.jumpsPassed === 0) label = stats.jumps === 1 ? "Jump failed" : "Jumps failed";
    metrics.push({
      category: "jump",
      value: String(stats.jumps),
      label,
    });
  }
  if (runs.length === 0 && stats.wrongAttempts > 0) {
    metrics.push({
      category: "wrong",
      value: String(stats.wrongAttempts),
      label: stats.wrongAttempts === 1 ? "Wrong answer" : "Wrong answers",
    });
  }
  return metrics;
}

function VisitMetricTile({
  category,
  icon,
  value,
  label,
}: {
  category: VisitCategory;
  icon?: string;
  value: string;
  label: string;
}) {
  const style = VISIT_CATEGORY[category];
  return (
    <li className="flex min-w-0 items-center gap-space-8 rounded-admin-control border border-admin-hairline bg-admin-canvas px-space-8 py-space-8">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-admin-control ${style.tile}`}>
        <MaterialIcon name={icon ?? style.icon} className="text-[16px]" filled />
      </span>
      <span className="min-w-0">
        <span className="block text-admin-body-md font-semibold leading-tight tabular-nums text-admin-ink">
          {value}
        </span>
        <span className="block truncate text-[11px] leading-[14px] text-admin-ink-subtle">{label}</span>
      </span>
    </li>
  );
}

function VisitDetailGroup({ group }: { group: AdminVisitDetailGroup }) {
  const style = VISIT_CATEGORY[group.id];
  const total = group.items.length + group.extraCount;
  // Study clips usually come in runs from one Lektion; show its name once per run.
  const runs: { context: string | null; items: AdminVisitDetailItem[] }[] = [];
  for (const item of group.items) {
    const last = runs[runs.length - 1];
    if (last && last.context === item.context) last.items.push(item);
    else runs.push({ context: item.context, items: [item] });
  }

  return (
    <section className="min-w-0">
      <h4 className="flex items-center gap-space-8">
        <span className={`flex h-6 w-6 items-center justify-center rounded-admin-badge ${style.tile}`}>
          <MaterialIcon name={style.icon} className="text-[14px]" filled />
        </span>
        <span className="text-admin-label-sm uppercase text-admin-ink-muted">{group.label}</span>
        <Badge>{total}</Badge>
      </h4>
      <div className="mt-space-8 overflow-hidden rounded-admin-control border border-admin-hairline bg-admin-card">
        {runs.map((run, runIndex) => (
          <div key={`${run.context ?? "none"}-${runIndex}`} className="border-b border-admin-hairline last:border-b-0">
            {run.context ? (
              <p className="flex items-center gap-1.5 bg-admin-canvas px-space-12 pb-1.5 pt-space-8 text-[11px] font-semibold leading-[14px] text-admin-ink-subtle">
                <MaterialIcon name="school" className="text-[13px]" />
                {run.context}
              </p>
            ) : null}
            <ul className="divide-y divide-admin-hairline">
              {run.items.map((item, index) => {
                const tone = DETAIL_TONE[item.tone];
                return (
                  <li key={`${group.id}-${runIndex}-${index}`} className="flex gap-space-8 px-space-12 py-space-8">
                    <MaterialIcon
                      name={tone.icon}
                      className={`mt-px text-[16px] ${tone.className}`}
                      filled={item.tone !== "neutral"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-admin-body-sm text-admin-ink">{item.title}</p>
                      {item.facts.length > 0 ? (
                        <p className="mt-0.5 text-[12px] leading-4 text-admin-ink-subtle">
                          {item.facts.join(" · ")}
                        </p>
                      ) : null}
                      {item.percent != null ? (
                        <span className="mt-1.5 flex items-center gap-space-8">
                          <span className="block h-1 flex-1 overflow-hidden rounded-full bg-admin-hairline">
                            <span
                              className={`block h-full rounded-full ${
                                item.tone === "success" ? "bg-admin-emerald" : style.bar
                              }`}
                              style={{ width: `${item.percent}%` }}
                            />
                          </span>
                          <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-admin-ink-subtle">
                            {item.percent}%
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {group.extraCount > 0 ? (
        <p className="mt-1.5 px-1 text-[12px] leading-4 text-admin-ink-subtle">+{group.extraCount} more</p>
      ) : null}
    </section>
  );
}

function VisitClickLine({
  clicks,
  className = "mt-1",
}: {
  clicks: readonly StudentUiClick[];
  className?: string;
}) {
  if (clicks.length === 0) return null;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {clicks.map((click) => {
        const phrase = describeVisitClick(click);
        return (
          <span
            key={click.target}
            title={phrase}
            className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-admin-badge bg-admin-card px-1.5 text-[12px] font-semibold leading-4 text-admin-ink ring-1 ring-inset ring-admin-border"
          >
            <img
              src={UI_CLICK_ICONS[click.target]}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0"
            />
            <span>{phrase}</span>
          </span>
        );
      })}
    </span>
  );
}

function VisitQuitLines({ quits }: { quits: readonly DuelClipQuit[] }) {
  if (quits.length === 0) return null;
  return (
    <span className="mt-space-8 flex flex-col gap-1">
      {quits.map((quit) => (
        <span
          key={quit.id}
          className="flex items-start gap-1.5 text-admin-label-md font-semibold text-admin-amber"
        >
          <MaterialIcon name="swords" className="mt-0.5 text-[16px]" filled />
          <span>
            <span className="tabular-nums">{clockLabel(quit.finishedAt)}</span>
            {" · "}
            {describeDuelClipQuit(quit)}
            {" · "}
            started {clockLabel(quit.startedAt)}
          </span>
        </span>
      ))}
    </span>
  );
}

function VisitCard({
  visit,
  clicks,
  quits,
  runs,
  open,
  onToggle,
}: {
  visit: AdminVisitRow;
  clicks: readonly StudentUiClick[];
  quits: readonly DuelClipQuit[];
  runs: readonly StoredListeningRun[];
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = visit.details.length > 0;
  const detailId = `visit-detail-${visit.id}`;
  const duration = shortDuration(visit.activeSeconds);
  const signal = visit.signalKind ? VISIT_SIGNAL[visit.signalKind] : null;

  if (visit.idle) {
    return (
      <li
        className={`flex gap-space-12 rounded-admin-card border border-dashed border-admin-border px-space-16 py-space-12 ${
          clicks.length > 0 || quits.length > 0 ? "items-start" : "items-center"
        }`}
      >
        <MaterialIcon
          name="hourglass_empty"
          className={`text-[18px] text-admin-ink-faint ${clicks.length > 0 || quits.length > 0 ? "mt-0.5" : ""}`}
        />
        <span
          className={`text-admin-label-md font-semibold tabular-nums text-admin-ink-muted ${
            clicks.length > 0 || quits.length > 0 ? "mt-0.5" : ""
          }`}
        >
          {visit.timeRange}
        </span>
        <span className="min-w-0 flex-1 text-admin-body-sm text-admin-ink-subtle">
          <span className="block truncate">Opened the app, no study</span>
          <VisitClickLine clicks={clicks} />
          <VisitQuitLines quits={quits} />
          {visit.onboarding ? (
            <span className="block font-semibold text-admin-ink-muted">{visit.onboarding}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-admin-ink-subtle">{duration}</span>
      </li>
    );
  }

  const metrics = visitMetrics(visit.stats, runs);

  return (
    <li>
      <Panel className={open ? "border-admin-cobalt/40 ring-1 ring-admin-cobalt/20" : ""}>
        <button
          type="button"
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable ? detailId : undefined}
          onClick={expandable ? onToggle : undefined}
          className={`block w-full px-space-16 py-space-12 text-left outline-none focus-visible:bg-admin-cobalt-wash/40 ${
            expandable ? "transition-colors hover:bg-admin-canvas" : "cursor-default"
          }`}
        >
          <span className="flex items-center gap-space-12">
            <span className="flex min-w-0 flex-1 items-center gap-space-8">
              <MaterialIcon name="schedule" className="text-[18px] text-admin-ink-faint" />
              <span className="text-admin-body-md font-semibold tabular-nums text-admin-ink">
                {visit.timeRange || visit.day}
              </span>
            </span>
            <span
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-admin-badge bg-admin-ink px-space-8 text-admin-label-md font-semibold tabular-nums text-white"
              title="Active time"
            >
              <MaterialIcon name="timer" className="text-[14px]" filled />
              {duration}
            </span>
            {expandable ? (
              <MaterialIcon
                name="expand_more"
                className={`text-[22px] text-admin-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
              />
            ) : (
              <span className="w-[22px] shrink-0" aria-hidden="true" />
            )}
          </span>

          <VisitClickLine clicks={clicks} className="mt-space-8" />
          <VisitQuitLines quits={quits} />

          {visit.lessons.length > 0 ? (
            <span className="mt-space-12 flex flex-wrap gap-space-4">
              {visit.lessons.map((lesson) => (
                <Badge key={lesson} tone="cobalt" className="max-w-full">
                  <MaterialIcon name="school" className="-mx-0.5 text-[13px]" />
                  <span className="truncate">{lesson}</span>
                </Badge>
              ))}
            </span>
          ) : null}

          {metrics.length > 0 ? (
            <ul className="mt-space-12 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-space-8">
              {metrics.map((metric) => (
                <VisitMetricTile key={`${metric.category}-${metric.label}`} {...metric} />
              ))}
            </ul>
          ) : null}

          {visit.onboarding ? (
            <span className="mt-space-12 flex items-center gap-1.5 text-admin-label-md font-semibold text-admin-ink-muted">
              <MaterialIcon name="tour" className="text-[16px]" />
              {visit.onboarding}
            </span>
          ) : null}

          {visit.signal && signal ? (
            <span
              className={`mt-space-12 flex items-center gap-1.5 rounded-admin-control px-space-12 py-space-8 text-admin-label-md font-semibold ${signal.className}`}
            >
              <MaterialIcon name={signal.icon} className="text-[16px]" filled />
              {visit.signal}
            </span>
          ) : null}
        </button>
        {open && expandable ? (
          <div
            id={detailId}
            className="flex flex-col gap-space-16 border-t border-admin-hairline bg-admin-canvas px-space-16 py-space-16"
          >
            {visit.details.map((group) => (
              <VisitDetailGroup key={group.id} group={group} />
            ))}
          </div>
        ) : null}
      </Panel>
    </li>
  );
}

function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function DuelMatchTimelineRow({ failure }: { failure: DuelMatchFailure }) {
  const when = clockLabel(failure.createdAt);
  return (
    <li className="flex items-start gap-space-12 rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-16 py-space-12">
      <MaterialIcon name="swords" className="mt-0.5 text-[18px] text-admin-crimson" filled />
      {when ? (
        <span className="shrink-0 text-admin-label-md font-semibold tabular-nums text-admin-ink">{when}</span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-admin-body-sm font-semibold text-admin-ink">Could not find an opponent</span>
        <span className="mt-0.5 block text-admin-body-sm leading-relaxed text-admin-ink-muted">{failure.reason}</span>
      </span>
    </li>
  );
}

function DuelQuitTimelineRow({ quit }: { quit: DuelClipQuit }) {
  const when = clockLabel(quit.finishedAt);
  return (
    <li className="flex items-start gap-space-12 rounded-admin-card border border-admin-amber bg-admin-amber-wash px-space-16 py-space-12">
      <MaterialIcon name="swords" className="mt-0.5 text-[18px] text-admin-amber" filled />
      {when ? (
        <span className="shrink-0 text-admin-label-md font-semibold tabular-nums text-admin-ink">{when}</span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-admin-body-sm font-semibold text-admin-ink">{describeDuelClipQuit(quit)}</span>
        <span className="mt-0.5 block text-admin-body-sm leading-relaxed text-admin-ink-muted">
          Started {clockLabel(quit.startedAt)}, then left the sentence
        </span>
      </span>
    </li>
  );
}

type DayTimeline = {
  day: string;
  at: number;
  visits: AdminVisitRow[];
  duels: DuelMatchFailure[];
  quits: DuelClipQuit[];
  clicks: UiClickGroup[];
  activeSeconds: number;
};

type DayEntry =
  | { kind: "visit"; at: number; visit: AdminVisitRow }
  | { kind: "duel"; at: number; failure: DuelMatchFailure }
  | { kind: "quit"; at: number; quit: DuelClipQuit }
  | { kind: "clicks"; at: number; group: UiClickGroup };

function visitDayTimeline(
  visits: readonly AdminVisitRow[],
  duels: readonly DuelMatchFailure[],
  clicks: readonly UiClickGroup[],
  quits: readonly DuelClipQuit[],
): DayTimeline[] {
  const days: DayTimeline[] = [];
  const byDay = new Map<string, DayTimeline>();
  const ensure = (day: string, at: number) => {
    const existing = byDay.get(day);
    if (existing) {
      if (at > existing.at) existing.at = at;
      return existing;
    }
    const created: DayTimeline = { day, at, visits: [], duels: [], quits: [], clicks: [], activeSeconds: 0 };
    byDay.set(day, created);
    days.push(created);
    return created;
  };
  for (const visit of visits) {
    const group = ensure(visit.day, Date.parse(visit.startedAt) || 0);
    group.visits.push(visit);
    group.activeSeconds += visit.activeSeconds;
  }
  for (const failure of duels) {
    const at = Date.parse(failure.createdAt);
    const group = ensure(formatVisitDay(failure.createdAt), Number.isNaN(at) ? 0 : at);
    group.duels.push(failure);
  }
  for (const group of clicks) {
    const at = Date.parse(group.loggedAt);
    ensure(formatVisitDay(group.loggedAt), Number.isNaN(at) ? 0 : at).clicks.push(group);
  }
  for (const quit of quits) {
    const at = Date.parse(quit.finishedAt);
    ensure(formatVisitDay(quit.finishedAt), Number.isNaN(at) ? 0 : at).quits.push(quit);
  }
  days.sort((a, b) => b.at - a.at);
  return days;
}

/** Newest first, so a morning duel sits below the afternoon visits from the same day. */
function dayEntries(group: DayTimeline): DayEntry[] {
  const entries: DayEntry[] = [
    ...group.visits.map((visit) => ({ kind: "visit" as const, at: Date.parse(visit.startedAt) || 0, visit })),
    ...group.duels.map((failure) => ({
      kind: "duel" as const,
      at: Date.parse(failure.createdAt) || 0,
      failure,
    })),
    ...group.clicks.map((clickGroup) => ({
      kind: "clicks" as const,
      at: Date.parse(clickGroup.loggedAt) || 0,
      group: clickGroup,
    })),
    ...group.quits.map((quit) => ({
      kind: "quit" as const,
      at: Date.parse(quit.finishedAt) || 0,
      quit,
    })),
  ];
  entries.sort((a, b) => b.at - a.at);
  return entries;
}

function useDuelFailures(
  userId: string | undefined,
  range: AdminVisitRange | undefined,
  timeZone: string | undefined,
): DuelMatchFailure[] {
  const [failures, setFailures] = useState<DuelMatchFailure[]>([]);
  const window = useMemo(
    () => (range ? visitRangeIso(range, new Date(), timeZone) : null),
    [range, timeZone],
  );
  const requestKey = userId && range ? `${userId}:${range}:${window?.fromIso ?? "all"}` : null;

  useEffect(() => {
    if (!requestKey || !userId) return;
    let cancelled = false;
    setFailures([]);
    void listAdminStudentDuelMatchFailures(userId, 0, window).then((result) => {
      if (cancelled) return;
      setFailures(result.ok && result.status === "ready" ? result.failures : []);
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, window]);

  return requestKey ? failures : [];
}

function useDuelQuits(
  userId: string | undefined,
  range: AdminVisitRange | undefined,
  timeZone: string | undefined,
): DuelClipQuit[] {
  const [quits, setQuits] = useState<DuelClipQuit[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const window = useMemo(
    () => (range ? visitRangeIso(range, new Date(), timeZone) : null),
    [range, timeZone],
  );
  const requestKey = userId && range ? `${userId}:${range}:${window?.fromIso ?? "all"}` : null;
  const visible = loadedFor === requestKey ? quits : [];

  useEffect(() => {
    if (!requestKey || !userId) return;
    let cancelled = false;
    void listAdminStudentDuelClipQuits(userId, window).then((result) => {
      if (cancelled) return;
      setLoadedFor(requestKey);
      setQuits(result.ok ? result.quits : []);
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, window]);

  return visible;
}

function VisitFeed({
  visits,
  clickGroups = [],
  duelFailures = [],
  duelQuits = [],
  runs = [],
  openVisitId,
  onToggle,
}: {
  visits: AdminVisitRow[];
  clickGroups?: readonly UiClickGroup[];
  duelFailures?: readonly DuelMatchFailure[];
  duelQuits?: readonly DuelClipQuit[];
  runs?: readonly StoredListeningRun[];
  openVisitId: string | null;
  onToggle: (id: string) => void;
}) {
  const placed = placeUiClickGroups(visits, clickGroups);
  const placedQuits = placeDuelClipQuits(visits, duelQuits);
  const placedRuns = placeListeningRuns(visits, runs);
  const days = visitDayTimeline(visits, duelFailures, placed.unmatched, placedQuits.unmatched);

  return (
    <div className="flex flex-col gap-space-20">
      {days.map((group) => (
        <section key={group.day} aria-label={group.day}>
          {/* Offsets match the modal body padding so the day header pins to its top edge. */}
          <div className="sticky -top-5 z-[1] -mx-1 flex items-baseline justify-between gap-space-12 bg-admin-canvas/95 px-1 py-space-8 backdrop-blur sm:-top-6">
            <h4 className="text-admin-body-md font-semibold text-admin-ink">{group.day}</h4>
            <span className="text-[12px] font-medium tabular-nums text-admin-ink-subtle">
              {group.visits.length} {group.visits.length === 1 ? "visit" : "visits"}
              {group.duels.length > 0
                ? ` · ${group.duels.length} ${group.duels.length === 1 ? "duel" : "duels"}`
                : ""}
              {group.quits.length > 0
                ? ` · ${group.quits.length} ${group.quits.length === 1 ? "duel quit" : "duel quits"}`
                : ""}
              {" · "}
              {shortDuration(group.activeSeconds)}
            </span>
          </div>
          <ul className="mt-1 flex flex-col gap-space-8">
            {dayEntries(group).map((entry) => {
              if (entry.kind === "duel") {
                return <DuelMatchTimelineRow key={entry.failure.id} failure={entry.failure} />;
              }
              if (entry.kind === "quit") {
                return <DuelQuitTimelineRow key={entry.quit.id} quit={entry.quit} />;
              }
              if (entry.kind === "clicks") {
                return (
                  <li
                    key={entry.group.loggedAt}
                    className="flex items-start gap-space-12 rounded-admin-card border border-dashed border-admin-border px-space-16 py-space-12"
                  >
                    <MaterialIcon name="ads_click" className="mt-0.5 text-[18px] text-admin-ink-faint" />
                    <span className="mt-0.5 text-admin-label-md font-semibold tabular-nums text-admin-ink-muted">
                      {clockLabel(entry.group.loggedAt)}
                    </span>
                    <VisitClickLine clicks={entry.group.clicks} className="min-w-0 flex-1" />
                  </li>
                );
              }
              return (
                <VisitCard
                  key={entry.visit.id}
                  visit={entry.visit}
                  clicks={placed.byVisitId.get(entry.visit.id) ?? []}
                  quits={placedQuits.byVisitId.get(entry.visit.id) ?? []}
                  runs={placedRuns.byVisitId.get(entry.visit.id) ?? []}
                  open={openVisitId === entry.visit.id}
                  onToggle={() => onToggle(entry.visit.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function clipStatus(clip: StoredListeningRun["clips"][number]): string {
  if (clip.missed && clip.passed) return "Missed, then passed";
  if (clip.passed) return "Passed";
  return "Missed";
}

function attemptCoversKind(kind: CardKind, answers: StoredListeningRun["clips"][number]["missedAnswers"]): boolean {
  if (!answers) return false;
  if (kind === "listening") return Boolean(answers.listening || answers["number-input"]);
  if (kind === "multiple-choice") {
    return Boolean(answers["multiple-choice"] || answers["reply-choice"] || answers["grammar-gap"]);
  }
  return Boolean(answers[kind]);
}

function ListeningRunRow({
  run,
  catalog,
  open,
  onToggle,
}: {
  run: StoredListeningRun;
  catalog: readonly AdminCatalogCourse[];
  open: boolean;
  onToggle: () => void;
}) {
  const place = describeCatalogLesson(catalog, run.lessonKey);
  const title = place ? `${place.course} · ${place.lesson}` : run.lessonKey;
  const when = formatAbsoluteTime(run.createdAt);
  const missed = run.clips.filter((clip) => clip.missed);
  const firstTry = run.clips.filter((clip) => clip.passed && !clip.missed).length;
  const passedRun = run.outcome === "success";
  const facts = [
    {
      icon: "segment",
      label: run.partCount > 1 ? `Part ${run.partNumber} of ${run.partCount}` : `Part ${run.partNumber}`,
    },
    { icon: "fitness_center", label: `${run.clips.length} ${run.clips.length === 1 ? "clip" : "clips"}` },
    ...(run.cardCount != null
      ? [{ icon: "style", label: `${run.cardCount} ${run.cardCount === 1 ? "card" : "cards"}` }]
      : []),
    { icon: "timer", label: shortDuration(Math.round(run.elapsedMs / 1000)) },
    missed.length > 0
      ? { icon: "close", label: `${missed.length} missed`, warn: true }
      : { icon: "done_all", label: "No misses" },
  ];

  return (
    <li>
      <Panel className={open ? "border-admin-cobalt/40 ring-1 ring-admin-cobalt/20" : ""}>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex w-full items-start gap-space-12 px-space-16 py-space-12 text-left outline-none transition-colors hover:bg-admin-canvas focus-visible:bg-admin-cobalt-wash/40"
        >
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-admin-control ${
              passedRun ? "bg-admin-emerald-wash text-admin-emerald" : "bg-admin-crimson-wash text-admin-crimson"
            }`}
          >
            <MaterialIcon name={passedRun ? "check_circle" : "heart_broken"} className="text-[20px]" filled />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-space-12">
              <span className="text-admin-body-md font-semibold text-admin-ink">
                {passedRun ? "Passed" : "Out of hearts"}
              </span>
              <Badge tone={passedRun ? "emerald" : "crimson"}>
                <span title="Accuracy">{run.accuracy}%</span>
              </Badge>
            </span>
            <span className="mt-0.5 block text-admin-body-sm text-admin-ink">{title}</span>
            {when ? (
              <span className="mt-0.5 block text-admin-body-sm tabular-nums text-admin-ink-subtle">{when}</span>
            ) : null}
            <span className="mt-space-8 flex flex-wrap gap-space-4">
              {facts.map((fact) => (
                <Badge key={fact.label} tone={"warn" in fact && fact.warn ? "crimson" : "neutral"}>
                  <MaterialIcon name={fact.icon} className="-mx-0.5 text-[13px]" />
                  {fact.label}
                </Badge>
              ))}
            </span>
          </span>
          <MaterialIcon
            name="expand_more"
            className={`mt-0.5 text-[22px] text-admin-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open ? (
          <div className="flex flex-col gap-space-12 border-t border-admin-hairline bg-admin-canvas px-space-16 py-space-16">
            {run.clips.length === 0 ? (
              <p className="text-admin-body-sm text-admin-ink-muted">Clip results were not stored for this run.</p>
            ) : (
              <>
                {firstTry > 0 ? (
                  <p className="text-admin-body-sm text-admin-ink-muted">
                    {firstTry === run.clips.length
                      ? "Every clip was right on the first try."
                      : `${firstTry} ${firstTry === 1 ? "clip was" : "clips were"} right on the first try.`}
                  </p>
                ) : null}
                {missed.length > 0 ? (
                  <ul className="flex flex-col gap-space-12">
                    {missed.map((clip) => {
                      const described = describeCatalogClip(catalog, run.lessonKey, clip.clipId);
                      const attempts = MISSED_ATTEMPT_KINDS.flatMap((kind) => {
                        const attempt = clip.missedAnswers?.[kind];
                        return attempt ? [{ kind, ...attempt }] : [];
                      });
                      const uncovered = (clip.missedKinds ?? [])
                        .filter((kind) => !attemptCoversKind(kind, clip.missedAnswers))
                        .map((kind) => CARD_KIND_LABEL[kind])
                        .join(" · ");
                      return (
                        <li key={clip.clipId} className="min-w-0 rounded-admin-control border border-admin-hairline bg-admin-card px-space-12 py-space-8">
                          <p className="text-admin-label-sm uppercase text-admin-ink-subtle">{clipStatus(clip)}</p>
                          {uncovered ? (
                            <p className="mt-0.5 text-[12px] font-medium leading-4 text-admin-ink-muted">{uncovered}</p>
                          ) : null}
                          <p className="mt-0.5 text-admin-body-sm text-admin-ink">{described.prompt}</p>
                          {attempts.length > 0 ? (
                            <ul className="mt-space-8 flex flex-col gap-space-8">
                              {attempts.map((attempt) => (
                                <li key={attempt.kind} className="min-w-0">
                                  <p className="text-[12px] font-medium leading-4 text-admin-ink-muted">
                                    {MISSED_ATTEMPT_LABEL[attempt.kind]}
                                  </p>
                                  <p className="text-admin-body-sm text-admin-crimson-ink">Entered: {attempt.entered}</p>
                                  <p className="text-admin-body-sm text-admin-emerald-ink">Correct: {attempt.correct}</p>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Panel>
    </li>
  );
}

function practiceEmptyMessage(range: AdminVisitRange): string {
  if (range === "today") return "No finished practice parts today.";
  if (range === "7d") return "No finished practice parts in the last 7 days.";
  return "No finished practice parts yet.";
}

function hideQuietSection(
  hideWhenEmpty: boolean,
  visible: { status: string; total: number } | null,
): boolean {
  if (!hideWhenEmpty || visible == null) return hideWhenEmpty;
  if (visible.status === "missing") return true;
  return visible.status !== "error" && visible.total === 0;
}

function ListeningRunsSection({
  userId,
  catalog,
  revision,
  range,
  timeZone,
  hideWhenEmpty = false,
}: {
  userId: string;
  catalog: readonly AdminCatalogCourse[];
  revision: number;
  range: AdminVisitRange;
  timeZone: string | undefined;
  /** Skip the section when nothing is logged, so a compact view stays quiet. */
  hideWhenEmpty?: boolean;
}) {
  const [page, setPage] = useState<StudentRunsPage | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  // Read after awaits, so a slow "load more" for one student never lands on another.
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  const window = useMemo(
    () => visitRangeIso(range, new Date(), timeZone),
    [range, timeZone],
  );
  const requestKey = `${userId}:${revision}:${range}:${window?.fromIso ?? "all"}`;
  const visible = loadedFor === requestKey ? page : null;

  useEffect(() => {
    let cancelled = false;
    void listAdminStudentRuns(userId, 0, window).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadedFor(requestKey);
        setPage({ status: "error", runs: [], total: 0, passed: 0, failed: 0 });
        return;
      }
      setLoadedFor(requestKey);
      setPage({
        status: result.status,
        runs: result.runs,
        total: result.total,
        passed: result.passed,
        failed: result.failed,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, window]);

  async function loadMore() {
    if (!visible || loadingMore || visible.runs.length >= visible.total) return;
    const requestUser = userId;
    const offset = visible.runs.length;
    setLoadingMore(true);
    const result = await listAdminStudentRuns(requestUser, offset, window);
    if (userIdRef.current !== requestUser) {
      setLoadingMore(false);
      return;
    }
    setLoadingMore(false);
    if (!result.ok || result.status !== "ready") return;
    setPage((current) => {
      if (!current) return current;
      const seen = new Set(current.runs.map((run) => run.id));
      const added = result.runs.filter((run) => !seen.has(run.id));
      return {
        ...current,
        runs: [...current.runs, ...added],
        total: result.total,
        passed: result.passed,
        failed: result.failed,
      };
    });
  }

  const earlier = visible ? Math.max(0, visible.total - visible.runs.length) : 0;
  if (hideQuietSection(hideWhenEmpty, visible)) return null;

  return (
    <section aria-label="Practice" aria-busy={visible == null} className="flex min-w-0 flex-col gap-space-12">
      <ColumnHeader
        title="Practice"
        description="Finished practice parts, including ones that ran out of hearts."
      />
      {visible == null ? (
        <EmptyPanel>Loading practice parts…</EmptyPanel>
      ) : visible.status === "missing" ? (
        <EmptyPanel>{LISTENING_SCHEMA_HINT}</EmptyPanel>
      ) : visible.status === "error" ? (
        <EmptyPanel>Practice parts could not be loaded.</EmptyPanel>
      ) : visible.total === 0 ? (
        <EmptyPanel>{practiceEmptyMessage(range)}</EmptyPanel>
      ) : (
        <div className="flex flex-col gap-space-12">
          <StatStrip
            items={[
              { label: "Finished", value: String(visible.total) },
              { label: "Passed", value: String(visible.passed) },
              { label: "Failed", value: String(visible.failed) },
            ]}
          />
          <ul className="flex flex-col gap-space-8">
            {visible.runs.map((run) => (
              <ListeningRunRow
                key={run.id}
                run={run}
                catalog={catalog}
                open={openRunId === run.id}
                onToggle={() => setOpenRunId((current) => (current === run.id ? null : run.id))}
              />
            ))}
          </ul>
          {earlier > 0 ? (
            <Button className="self-center" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading…" : `Show ${earlier} earlier ${earlier === 1 ? "run" : "runs"}`}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

const JUMP_OUTCOME: Record<
  JumpRunOutcome,
  { label: string; icon: string; tile: string; tone: "emerald" | "crimson" | "amber" }
> = {
  success: { label: "Passed", icon: "check_circle", tile: "bg-admin-emerald-wash text-admin-emerald", tone: "emerald" },
  fail: { label: "Out of hearts", icon: "heart_broken", tile: "bg-admin-crimson-wash text-admin-crimson", tone: "crimson" },
  quit: { label: "Left before the end", icon: "logout", tile: "bg-admin-amber-wash text-admin-amber", tone: "amber" },
};

function JumpRunRow({
  run,
  catalog,
  open,
  onToggle,
}: {
  run: StoredJumpRun;
  catalog: readonly AdminCatalogCourse[];
  open: boolean;
  onToggle: () => void;
}) {
  const place = describeCatalogLesson(catalog, run.lessonKey);
  const title = place ? `${place.course} · ${place.lesson}` : run.lessonKey;
  const when = formatAbsoluteTime(run.createdAt);
  const outcome = JUMP_OUTCOME[run.outcome];
  const facts = [
    { icon: "style", label: `${run.answeredCount} of ${run.cardCount} cards` },
    { icon: "timer", label: shortDuration(Math.round(run.elapsedMs / 1000)) },
    run.mistakes > 0
      ? { icon: "close", label: `${run.mistakes} wrong`, warn: true }
      : { icon: "done_all", label: "No mistakes" },
  ];

  return (
    <li>
      <Panel className={open ? "border-admin-cobalt/40 ring-1 ring-admin-cobalt/20" : ""}>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex w-full items-start gap-space-12 px-space-16 py-space-12 text-left outline-none transition-colors hover:bg-admin-canvas focus-visible:bg-admin-cobalt-wash/40"
        >
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-admin-control ${outcome.tile}`}>
            <MaterialIcon name={outcome.icon} className="text-[20px]" filled />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-space-12">
              <span className="text-admin-body-md font-semibold text-admin-ink">{outcome.label}</span>
              {run.answeredCount > 0 ? (
                <Badge tone={outcome.tone}>
                  <span title="Accuracy">{run.accuracy}%</span>
                </Badge>
              ) : null}
            </span>
            <span className="mt-0.5 block text-admin-body-sm text-admin-ink">{title}</span>
            {when ? (
              <span className="mt-0.5 block text-admin-body-sm tabular-nums text-admin-ink-subtle">{when}</span>
            ) : null}
            <span className="mt-space-8 flex flex-wrap gap-space-4">
              {facts.map((fact) => (
                <Badge key={fact.label} tone={"warn" in fact && fact.warn ? "crimson" : "neutral"}>
                  <MaterialIcon name={fact.icon} className="-mx-0.5 text-[13px]" />
                  {fact.label}
                </Badge>
              ))}
            </span>
          </span>
          <MaterialIcon
            name="expand_more"
            className={`mt-0.5 text-[22px] text-admin-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open ? (
          <div className="border-t border-admin-hairline bg-admin-canvas px-space-16 py-space-16">
            {run.cards.length === 0 ? (
              <p className="text-admin-body-sm text-admin-ink-muted">No card was answered.</p>
            ) : (
              <ol className="flex flex-col gap-space-8">
                {run.cards.map((card, at) => {
                  const kindLabel =
                    card.kind in CARD_KIND_LABEL ? CARD_KIND_LABEL[card.kind as CardKind] : card.kind;
                  return (
                    <li
                      key={`${card.clipId}-${at}`}
                      className="min-w-0 rounded-admin-control border border-admin-hairline bg-admin-card px-space-12 py-space-8"
                    >
                      <p className="flex items-center gap-1.5 text-admin-label-sm uppercase text-admin-ink-subtle">
                        <MaterialIcon
                          name={card.right ? "check_circle" : "cancel"}
                          className={`text-[14px] ${card.right ? "text-admin-emerald" : "text-admin-crimson"}`}
                          filled
                        />
                        {at + 1}. {kindLabel}
                      </p>
                      <p className="mt-0.5 text-admin-body-sm text-admin-ink">
                        {describeCatalogClip(catalog, run.lessonKey, card.clipId).prompt}
                      </p>
                      {card.right ? (
                        <p className="mt-0.5 text-admin-body-sm text-admin-emerald-ink">{card.entered}</p>
                      ) : (
                        <>
                          <p className="mt-0.5 text-admin-body-sm text-admin-crimson-ink">Entered: {card.entered || "—"}</p>
                          <p className="text-admin-body-sm text-admin-emerald-ink">Correct: {card.correct}</p>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ) : null}
      </Panel>
    </li>
  );
}

function jumpEmptyMessage(range: AdminVisitRange): string {
  if (range === "today") return "No jump tests today.";
  if (range === "7d") return "No jump tests in the last 7 days.";
  return "No jump tests yet.";
}

function JumpRunsSection({
  userId,
  catalog,
  revision,
  range,
  timeZone,
  hideWhenEmpty = false,
}: {
  userId: string;
  catalog: readonly AdminCatalogCourse[];
  revision: number;
  range: AdminVisitRange;
  timeZone: string | undefined;
  hideWhenEmpty?: boolean;
}) {
  const [page, setPage] = useState<StudentJumpRunsPage | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  const window = useMemo(() => visitRangeIso(range, new Date(), timeZone), [range, timeZone]);
  const requestKey = `${userId}:${revision}:${range}:${window?.fromIso ?? "all"}`;
  const visible = loadedFor === requestKey ? page : null;

  useEffect(() => {
    let cancelled = false;
    void listAdminStudentJumpRuns(userId, 0, window).then((result) => {
      if (cancelled) return;
      setLoadedFor(requestKey);
      if (!result.ok) {
        setPage({ status: "error", runs: [], total: 0, passed: 0, failed: 0, quit: 0 });
        return;
      }
      const { ok: _ok, ...loaded } = result;
      setPage(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, window]);

  async function loadMore() {
    if (!visible || loadingMore || visible.runs.length >= visible.total) return;
    const requestUser = userId;
    setLoadingMore(true);
    const result = await listAdminStudentJumpRuns(requestUser, visible.runs.length, window);
    setLoadingMore(false);
    if (userIdRef.current !== requestUser || !result.ok || result.status !== "ready") return;
    setPage((current) => {
      if (!current) return current;
      const seen = new Set(current.runs.map((run) => run.id));
      const { ok: _ok, runs, ...counts } = result;
      return { ...current, ...counts, runs: [...current.runs, ...runs.filter((run) => !seen.has(run.id))] };
    });
  }

  const earlier = visible ? Math.max(0, visible.total - visible.runs.length) : 0;
  if (hideQuietSection(hideWhenEmpty, visible)) return null;

  return (
    <section aria-label="Jump tests" aria-busy={visible == null} className="flex min-w-0 flex-col gap-space-12">
      <ColumnHeader
        title="Jump tests"
        description="Every jump test attempt: passed, out of hearts, or left before the end."
      />
      {visible == null ? (
        <EmptyPanel>Loading jump tests…</EmptyPanel>
      ) : visible.status === "missing" ? (
        <EmptyPanel>{JUMP_RUNS_SCHEMA_HINT}</EmptyPanel>
      ) : visible.status === "error" ? (
        <EmptyPanel>Jump tests could not be loaded.</EmptyPanel>
      ) : visible.total === 0 ? (
        <EmptyPanel>{jumpEmptyMessage(range)}</EmptyPanel>
      ) : (
        <div className="flex flex-col gap-space-12">
          <StatStrip
            items={[
              { label: "Attempts", value: String(visible.total) },
              { label: "Passed", value: String(visible.passed) },
              { label: "Failed", value: String(visible.failed) },
              { label: "Left", value: String(visible.quit) },
            ]}
          />
          <ul className="flex flex-col gap-space-8">
            {visible.runs.map((run) => (
              <JumpRunRow
                key={run.id}
                run={run}
                catalog={catalog}
                open={openRunId === run.id}
                onToggle={() => setOpenRunId((current) => (current === run.id ? null : run.id))}
              />
            ))}
          </ul>
          {earlier > 0 ? (
            <Button className="self-center" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading…" : `Show ${earlier} earlier ${earlier === 1 ? "attempt" : "attempts"}`}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function useVisitRuns(
  userId: string | undefined,
  range: AdminVisitRange | undefined,
  timeZone: string | undefined,
  revision = 0,
): StoredListeningRun[] {
  const [runs, setRuns] = useState<StoredListeningRun[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const window = useMemo(
    () => (range ? visitRangeIso(range, new Date(), timeZone) : null),
    [range, timeZone],
  );
  const requestKey = `${userId ?? ""}:${range ?? ""}:${window?.fromIso ?? "all"}:${revision}`;
  const visible = loadedFor === requestKey ? runs : [];

  useEffect(() => {
    if (!userId || !range) return;
    let cancelled = false;
    void (async () => {
      const collected: StoredListeningRun[] = [];
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      while (collected.length < total && collected.length < 100) {
        const result = await listAdminStudentRuns(userId, offset, window);
        if (cancelled) return;
        if (!result.ok || result.status !== "ready") {
          setLoadedFor(requestKey);
          setRuns([]);
          return;
        }
        collected.push(...result.runs);
        total = result.total;
        if (result.runs.length === 0) break;
        offset += result.runs.length;
      }
      if (cancelled) return;
      setLoadedFor(requestKey);
      setRuns(collected);
    })();
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, range, window]);

  return visible;
}

function useVisitClicks(
  userId: string | undefined,
  range: AdminVisitRange | undefined,
  timeZone: string | undefined,
): UiClickGroup[] {
  const [groups, setGroups] = useState<UiClickGroup[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const window = useMemo(
    () => (range ? visitRangeIso(range, new Date(), timeZone) : null),
    [range, timeZone],
  );
  const requestKey = `${userId ?? ""}:${range ?? ""}:${window?.fromIso ?? "all"}`;
  const visible = loadedFor === requestKey ? groups : [];

  useEffect(() => {
    if (!userId || !range) return;
    let cancelled = false;
    void listAdminStudentClicks(userId, window).then((result) => {
      if (cancelled) return;
      setLoadedFor(requestKey);
      setGroups(result.ok ? result.groups : []);
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, range, window]);

  return visible;
}

function duelFailureEmptyMessage(range: AdminVisitRange): string {
  if (range === "today") return "No failed duel matches today.";
  if (range === "7d") return "No failed duel matches in the last 7 days.";
  return "No failed duel matches yet.";
}

function DuelMatchFailuresSection({
  userId,
  revision,
  range,
  timeZone,
  hideWhenEmpty = false,
}: {
  userId: string;
  revision: number;
  range: AdminVisitRange;
  timeZone: string | undefined;
  hideWhenEmpty?: boolean;
}) {
  const [page, setPage] = useState<StudentDuelMatchFailuresPage | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  const window = useMemo(() => visitRangeIso(range, new Date(), timeZone), [range, timeZone]);
  const requestKey = `${userId}:${revision}:${range}:${window?.fromIso ?? "all"}`;
  const visible = loadedFor === requestKey ? page : null;

  useEffect(() => {
    let cancelled = false;
    void listAdminStudentDuelMatchFailures(userId, 0, window).then((result) => {
      if (cancelled) return;
      setLoadedFor(requestKey);
      if (!result.ok) {
        setPage({ status: "error", failures: [], total: 0 });
        return;
      }
      const { ok: _ok, ...loaded } = result;
      setPage(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, window]);

  async function loadMore() {
    if (!visible || loadingMore || visible.failures.length >= visible.total) return;
    const requestUser = userId;
    setLoadingMore(true);
    const result = await listAdminStudentDuelMatchFailures(requestUser, visible.failures.length, window);
    setLoadingMore(false);
    if (userIdRef.current !== requestUser || !result.ok || result.status !== "ready") return;
    setPage((current) => {
      if (!current) return current;
      const seen = new Set(current.failures.map((failure) => failure.id));
      const { ok: _ok, failures, ...counts } = result;
      return {
        ...current,
        ...counts,
        failures: [...current.failures, ...failures.filter((failure) => !seen.has(failure.id))],
      };
    });
  }

  const earlier = visible ? Math.max(0, visible.total - visible.failures.length) : 0;
  if (hideQuietSection(hideWhenEmpty, visible)) return null;

  return (
    <section aria-label="Duel match failures" aria-busy={visible == null} className="flex min-w-0 flex-col gap-space-12">
      <ColumnHeader
        title="Duel matches"
        description="Each time a new duel showed “Chưa thể tìm đối thủ lúc này,” with the reason it failed."
      />
      {visible == null ? (
        <EmptyPanel>Loading duel matches…</EmptyPanel>
      ) : visible.status === "missing" ? (
        <EmptyPanel>{DUEL_MATCH_FAILURE_SCHEMA_HINT}</EmptyPanel>
      ) : visible.status === "error" ? (
        <EmptyPanel>Duel matches could not be loaded.</EmptyPanel>
      ) : visible.total === 0 ? (
        <EmptyPanel>{duelFailureEmptyMessage(range)}</EmptyPanel>
      ) : (
        <div className="flex flex-col gap-space-12">
          <StatStrip items={[{ label: "Failed matches", value: String(visible.total) }]} />
          <ul className="flex flex-col gap-space-8">
            {visible.failures.map((failure) => (
              <DuelMatchFailureRow key={failure.id} failure={failure} />
            ))}
          </ul>
          {earlier > 0 ? (
            <Button className="self-center" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading…" : `Show ${earlier} earlier ${earlier === 1 ? "failure" : "failures"}`}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function DuelMatchFailureRow({ failure }: { failure: DuelMatchFailure }) {
  const when = formatAbsoluteTime(failure.createdAt);
  return (
    <li>
      <Panel>
        <div className="flex items-start gap-space-12 px-space-16 py-space-12">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-admin-control bg-admin-crimson-wash text-admin-crimson">
            <MaterialIcon name="swords" className="text-[20px]" filled />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-admin-body-md font-semibold text-admin-ink">Could not find an opponent</span>
            {when ? (
              <span className="mt-0.5 block text-admin-body-sm tabular-nums text-admin-ink-subtle">{when}</span>
            ) : null}
            <span className="mt-space-8 block text-admin-body-sm leading-relaxed text-admin-ink">{failure.reason}</span>
          </span>
        </div>
      </Panel>
    </li>
  );
}

function visitStripStats(visits: readonly AdminVisitRow[]) {
  const study = visits.filter((visit) => !visit.idle);
  const studySeconds = study.reduce((sum, visit) => sum + visit.activeSeconds, 0);
  return {
    studyCount: study.length,
    idleCount: visits.length - study.length,
    studySeconds,
    averageSeconds: study.length > 0 ? Math.round(studySeconds / study.length) : 0,
  };
}

export function VisitDayList({
  visits,
  userId,
  range,
  timeZone,
}: {
  visits: AdminVisitRow[];
  userId?: string;
  range?: AdminVisitRange;
  timeZone?: string;
}) {
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);
  const duelFailures = useDuelFailures(userId, range, timeZone);
  const duelQuits = useDuelQuits(userId, range, timeZone);
  const clickGroups = useVisitClicks(userId, range, timeZone);
  const runs = useVisitRuns(userId, range, timeZone);
  const tabClicks = useMemo(
    () =>
      summarizeUiClicks(
        clickGroups.flatMap((group) => group.clicks.map((click) => ({ target: click.target, count: click.count }))),
      ),
    [clickGroups],
  );
  if (
    visits.length === 0 &&
    duelFailures.length === 0 &&
    duelQuits.length === 0 &&
    tabClicks.length === 0
  ) {
    return null;
  }
  return (
    <div className="flex flex-col gap-space-16">
      {tabClicks.length > 0 ? (
        <div className="flex flex-col gap-space-8 px-space-8">
          <h4 className="text-admin-body-sm font-semibold text-admin-ink">Tabs opened</h4>
          <VisitClickLine clicks={tabClicks} className="" />
        </div>
      ) : null}
      <VisitFeed
        visits={visits}
        clickGroups={clickGroups}
        duelFailures={duelFailures}
        duelQuits={duelQuits}
        runs={runs}
        openVisitId={openVisitId}
        onToggle={(id) => setOpenVisitId((current) => (current === id ? null : id))}
      />
    </div>
  );
}

export function ActivityTab({
  userId,
  catalog,
  range,
  onRange,
  visitLog,
  runsRevision,
  timeZone,
}: {
  userId: string;
  catalog: readonly AdminCatalogCourse[];
  range: AdminVisitRange;
  onRange: (range: AdminVisitRange) => void;
  visitLog: ReturnType<typeof projectStudentVisits>;
  runsRevision: number;
  timeZone: string | undefined;
}) {
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);
  const visitStats = visitStripStats(visitLog.visits);
  const duelFailures = useDuelFailures(userId, range, timeZone);
  const duelQuits = useDuelQuits(userId, range, timeZone);
  const clickGroups = useVisitClicks(userId, range, timeZone);
  const runs = useVisitRuns(userId, range, timeZone, runsRevision);

  return (
    <div className="grid items-start gap-x-space-32 gap-y-space-40 lg:grid-cols-2">
      <section aria-label="Visit log" className="flex min-w-0 flex-col gap-space-12">
        <ColumnHeader
          title="Visits"
          description="Each time the app was open, newest first."
          action={<VisitRangeSwitch range={range} onChange={onRange} />}
        />
        {visitLog.visits.length === 0 && duelFailures.length === 0 && duelQuits.length === 0 ? (
          <EmptyPanel>{visitLog.emptyMessage}</EmptyPanel>
        ) : (
          <>
            <StatStrip
              items={[
                { label: "Visits", value: String(visitStats.studyCount), icon: "schedule", tone: "cobalt" },
                {
                  label: "Active time",
                  value: shortDuration(visitStats.studySeconds),
                  icon: "timer",
                  tone: "violet",
                },
                {
                  label: "Avg. visit",
                  value: shortDuration(visitStats.averageSeconds),
                  icon: "pace",
                  tone: "emerald",
                },
                {
                  label: "No study",
                  value: String(visitStats.idleCount),
                  icon: "hourglass_empty",
                  tone: "neutral",
                },
              ]}
            />
            <VisitFeed
              visits={visitLog.visits}
              clickGroups={clickGroups}
              duelFailures={duelFailures}
              duelQuits={duelQuits}
              runs={runs}
              openVisitId={openVisitId}
              onToggle={(id) => setOpenVisitId((current) => (current === id ? null : id))}
            />
          </>
        )}
      </section>
      <div className="flex min-w-0 flex-col gap-space-40">
        <DuelMatchFailuresSection
          userId={userId}
          revision={runsRevision}
          range={range}
          timeZone={timeZone}
        />
        <ListeningRunsSection
          userId={userId}
          catalog={catalog}
          revision={runsRevision}
          range={range}
          timeZone={timeZone}
        />
        <JumpRunsSection
          userId={userId}
          catalog={catalog}
          revision={runsRevision}
          range={range}
          timeZone={timeZone}
        />
      </div>
    </div>
  );
}
