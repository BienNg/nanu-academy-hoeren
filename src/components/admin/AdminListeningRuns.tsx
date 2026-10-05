"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  ChartTooltip,
  CountPill,
  CARD,
  KpiTile,
  LegendChips,
  PanelHeader,
  Pager,
  SearchField,
  Segmented,
  SectionHeading,
  StatusPill,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  formatPercent,
  paginate,
} from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import {
  describeCatalogClip,
  describeCatalogLesson,
  type AdminCatalogCourse,
} from "@/lib/admin-detail";
import {
  ADMIN_PAGE_SIZE,
  adminRangeLabel,
  formatAdminTimestamp,
  type AdminListeningLessonStat,
  type AdminListeningRunPoint,
  type AdminListeningRunBoard,
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { LISTENING_SCHEMA_HINT, type ListeningReadStatus } from "@/lib/listening-runs";

const PASSED = ADMIN_COLORS.emerald;
const FAILED = ADMIN_COLORS.crimson;

type Outcome = "all" | "success" | "fail";

function formatWhen(iso: string): string {
  return formatAdminTimestamp(iso) ?? "—";
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 80) return ADMIN_COLORS.emerald;
  if (accuracy >= 50) return ADMIN_COLORS.amber;
  return ADMIN_COLORS.crimson;
}

function initialOf(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toLocaleUpperCase() : "?";
}

function tickInterval(count: number): number {
  if (count <= 8) return 0;
  if (count <= 31) return 3;
  return 6;
}

function Notice({ tone, children }: { tone: "error" | "info"; children: string }) {
  return (
    <div
      className={`${CARD} flex items-start gap-space-12 border-l-2 p-space-16 ${
        tone === "error" ? "border-l-admin-crimson" : "border-l-admin-cobalt"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-admin-control ${
          tone === "error" ? "bg-admin-crimson-wash text-admin-crimson" : "bg-admin-cobalt-wash text-admin-cobalt"
        }`}
      >
        <MaterialIcon name={tone === "error" ? "error" : "info"} className="text-[18px]" />
      </div>
      <p className="pt-1 text-admin-body-md text-admin-ink">{children}</p>
    </div>
  );
}

function RunChart({ data }: { data: readonly AdminListeningRunPoint[] }) {
  const hasVolume = data.some((point) => point.passed > 0 || point.failed > 0);
  if (!hasVolume) {
    return (
      <p className="flex h-full items-center justify-center gap-space-8 text-admin-body-md text-admin-ink-muted">
        <MaterialIcon name="bar_chart_off" className="text-[20px] text-admin-ink-subtle" />
        No finished parts in this window.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid
          stroke={ADMIN_COLORS.grid}
          strokeOpacity={0.6}
          strokeDasharray="3 6"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: ADMIN_COLORS.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: ADMIN_COLORS.grid }}
          interval={tickInterval(data.length)}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={{ fill: ADMIN_COLORS.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#eaedff", opacity: 0.6 }} />
        <Bar dataKey="passed" name="Passed" stackId="runs" fill={PASSED} maxBarSize={24} />
        <Bar
          dataKey="failed"
          name="Failed"
          stackId="runs"
          fill={FAILED}
          radius={[3, 3, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Compact ranked list: lesson, a pass/fail split bar, and average accuracy. */
function FailedLessons({
  rows,
  catalog,
}: {
  rows: readonly AdminListeningLessonStat[];
  catalog: readonly AdminCatalogCourse[];
}) {
  return (
    <section className={`${CARD} flex flex-col p-space-20`}>
      <PanelHeader
        icon="heart_broken"
        color={FAILED}
        title="Lessons that failed"
        hint="Ranked by failed parts in this window."
      />
      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center gap-space-8 py-space-24 text-admin-body-md text-admin-ink-muted">
          <MaterialIcon name="sentiment_satisfied" className="text-[20px] text-admin-ink-subtle" />
          Nothing failed in this window.
        </p>
      ) : (
        <ol className="mt-space-12 flex flex-col">
          {rows.map((row, index) => {
            const place = describeCatalogLesson(catalog, row.lessonKey);
            const accuracy = row.runs === 0 ? null : Math.round(row.accuracySum / row.runs);
            return (
              <li
                key={row.lessonKey}
                className="flex items-center gap-space-12 border-t border-admin-hairline py-space-8 first:border-t-0"
              >
                <span className="w-4 shrink-0 text-center text-admin-label-md font-semibold tabular-nums text-admin-ink-subtle">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-admin-body-md font-semibold text-admin-ink">
                    {place?.lesson ?? row.lessonKey}
                  </p>
                  <div className="mt-1 flex items-center gap-space-8">
                    <div
                      className="flex h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-admin-subtle"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full"
                        style={{ width: formatPercent(share(row.passed, row.runs)), backgroundColor: PASSED }}
                      />
                      <div
                        className="h-full"
                        style={{ width: formatPercent(share(row.failed, row.runs)), backgroundColor: FAILED }}
                      />
                    </div>
                    {place?.course ? (
                      <span className="truncate text-[11px] leading-4 text-admin-ink-subtle">
                        {place.course}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <CountPill value={row.failed} tone="alert" />
                  <span
                    className="text-[11px] font-semibold leading-4 tabular-nums"
                    style={{ color: accuracy == null ? undefined : accuracyColor(accuracy) }}
                  >
                    {accuracy == null ? "—" : `${accuracy}% avg`}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function AdminListeningRuns({
  board,
  people,
  catalog,
  range,
  status,
  storeConfigured,
  missedClipIds,
}: {
  board: AdminListeningRunBoard;
  people: readonly AdminUserRow[];
  catalog: readonly AdminCatalogCourse[];
  range: AdminRange;
  status: ListeningReadStatus;
  storeConfigured: boolean;
  missedClipIds: Record<string, readonly string[]>;
}) {
  const names = useMemo(
    () => new Map(people.map((row) => [row.userId, row.displayName])),
    [people],
  );
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [page, setPage] = useState(1);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return board.recent.filter((run) => {
      if (outcome !== "all" && run.outcome !== outcome) return false;
      if (!needle) return true;
      const place = describeCatalogLesson(catalog, run.lessonKey);
      const name = names.get(run.userId) ?? run.userId;
      const haystack = [name, place?.course, place?.lesson, run.lessonKey]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [board.recent, catalog, names, outcome, query]);

  const paged = paginate(filtered, page, ADMIN_PAGE_SIZE);
  const passRate = share(board.passed, board.runs);
  const showChart = board.points.length > 1;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-24 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Learning"
        title="Practice"
        subtitle={`Finished practice parts ${window}. Times are Vietnam.`}
      />

      {!storeConfigured ? (
        <Notice tone="error">Cloud progress is not configured. Finished parts live in Supabase.</Notice>
      ) : status === "missing" ? (
        <Notice tone="info">{LISTENING_SCHEMA_HINT}</Notice>
      ) : status === "error" ? (
        <Notice tone="error">Practice parts could not be loaded.</Notice>
      ) : null}

      <section
        aria-label="Practice totals"
        className="grid grid-cols-2 gap-space-16 lg:grid-cols-4 2xl:gap-space-20"
      >
        <KpiTile
          icon="headphones"
          label="Parts finished"
          value={formatCount(board.runs)}
          caption={`${formatCount(board.students)} student${board.students === 1 ? "" : "s"} ${window}`}
        />
        <KpiTile
          icon="check_circle"
          label="Pass rate"
          color={PASSED}
          value={board.runs === 0 ? "—" : formatPercent(passRate)}
          progress={passRate}
          caption={`${formatCount(board.passed)} passed · ${formatCount(board.failed)} out of hearts`}
        />
        <KpiTile
          icon="percent"
          label="Avg. accuracy"
          color={ADMIN_COLORS.violet}
          value={board.runs === 0 ? "—" : `${board.avgAccuracy}%`}
          progress={board.runs === 0 ? 0 : board.avgAccuracy / 100}
          caption="Across every finished part"
        />
        <KpiTile
          icon="group"
          label="Students"
          color={ADMIN_COLORS.ink}
          value={formatCount(board.students)}
          caption={
            board.students > 0
              ? `${(board.runs / board.students).toLocaleString("en-GB", { maximumFractionDigits: 1 })} parts each on average`
              : "Nobody finished a part yet"
          }
        />
      </section>

      <div className={`grid grid-cols-1 gap-space-16 2xl:gap-space-20 ${showChart ? "lg:grid-cols-3" : ""}`}>
        {showChart ? (
          <section className={`${CARD} flex flex-col p-space-20 lg:col-span-2`}>
            <PanelHeader
              icon="stacked_bar_chart"
              title="Parts by day"
              hint="Vietnam days. A part counts on the day it finished."
              trailing={
                <LegendChips
                  items={[
                    { name: "Passed", color: PASSED },
                    { name: "Failed", color: FAILED },
                  ]}
                />
              }
            />
            <div className="mt-space-16 h-64 w-full sm:h-72">
              <RunChart data={board.points} />
            </div>
          </section>
        ) : null}
        <FailedLessons rows={board.lessons} catalog={catalog} />
      </div>

      <section aria-labelledby="practice-recent" className="flex flex-col gap-space-12">
        <SectionHeading
          id="practice-recent"
          icon="history"
          title="Recent parts"
          meta="Newest first · open a student on Students for clip detail"
        />
        <TablePanel
          icon="headphones"
          title="Finished parts"
          hint="Click “missed” on a row to see which clips tripped the student up."
          trailing={
            <div className="flex w-full flex-wrap items-center gap-space-8 sm:w-auto">
              <SearchField
                label="Search practice parts"
                placeholder="Search student or lesson"
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
              />
              <Segmented<Outcome>
                ariaLabel="Filter by outcome"
                value={outcome}
                options={[
                  { key: "all", label: "All" },
                  { key: "success", label: "Passed" },
                  { key: "fail", label: "Failed" },
                ]}
                onSelect={(key) => {
                  setOutcome(key);
                  setPage(1);
                }}
              />
            </div>
          }
          footer={
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              start={paged.start}
              end={paged.end}
              total={filtered.length}
              noun="parts"
              onPage={setPage}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead className={THEAD}>
                <tr>
                  <th className={`${TH} min-w-[13rem]`}>Student</th>
                  <th className={`${TH} min-w-[13rem]`}>Lesson</th>
                  <th className={TH}>Result</th>
                  <th className={`${TH} min-w-[9rem]`}>Accuracy</th>
                  <th className={`${TH} text-right`}>Time</th>
                </tr>
              </thead>
              <tbody className="text-admin-body-md text-admin-ink">
                {paged.pageItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-space-16 py-space-48 text-center text-admin-ink-muted"
                    >
                      <span className="inline-flex items-center gap-space-8">
                        <MaterialIcon name="search_off" className="text-[20px] text-admin-ink-subtle" />
                        {board.recent.length === 0
                          ? "No finished parts in this window."
                          : "No parts match this filter."}
                      </span>
                    </td>
                  </tr>
                ) : (
                  paged.pageItems.map((run) => {
                    const place = describeCatalogLesson(catalog, run.lessonKey);
                    const name = names.get(run.userId) ?? run.userId;
                    const passed = run.outcome === "success";
                    const missed = missedClipIds[run.id] ?? [];
                    const open = openRun === run.id;
                    const color = accuracyColor(run.accuracy);
                    return (
                      <Fragment key={run.id}>
                        <tr className={TR}>
                          <td className="px-space-16 py-space-12">
                            <div className="flex items-center gap-space-12">
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin-subtle text-admin-label-md font-semibold text-admin-ink-muted"
                                aria-hidden="true"
                              >
                                {initialOf(name)}
                              </div>
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate font-semibold">
                                  {name}
                                </span>
                                <span className="whitespace-nowrap text-admin-body-sm tabular-nums text-admin-ink-subtle">
                                  {formatWhen(run.createdAt)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-space-16 py-space-12">
                            <p className="truncate font-semibold">{place?.lesson ?? run.lessonKey}</p>
                            <p className="truncate text-admin-body-sm text-admin-ink-subtle">
                              {place?.course ? `${place.course} · ` : ""}Part {run.partNumber} of{" "}
                              {run.partCount}
                            </p>
                          </td>
                          <td className="px-space-16 py-space-12">
                            <StatusPill
                              label={passed ? "Passed" : "Out of hearts"}
                              tone={passed ? "good" : "bad"}
                            />
                          </td>
                          <td className="px-space-16 py-space-12">
                            <div className="flex items-center gap-space-8">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-admin-subtle">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${run.accuracy}%`, backgroundColor: color }}
                                />
                              </div>
                              <span className="text-admin-label-md font-semibold tabular-nums" style={{ color }}>
                                {run.accuracy}%
                              </span>
                              {missed.length > 0 ? (
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  onClick={() => setOpenRun(open ? null : run.id)}
                                  className="inline-flex h-5 items-center gap-0.5 rounded-admin-badge bg-admin-crimson-wash pl-1.5 pr-0.5 text-[12px] font-semibold leading-4 text-admin-crimson-ink ring-1 ring-inset ring-admin-crimson-border/60 outline-none transition-colors hover:bg-admin-crimson-hover focus-visible:shadow-admin-focus"
                                >
                                  {missed.length} missed
                                  <MaterialIcon
                                    name={open ? "expand_less" : "expand_more"}
                                    className="text-[16px]"
                                  />
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-space-16 py-space-12 text-right text-admin-label-md font-semibold tabular-nums text-admin-ink-muted">
                            {formatElapsed(run.elapsedMs)}
                          </td>
                        </tr>
                        {open ? (
                          <tr className="bg-admin-canvas">
                            <td colSpan={5} className="px-space-16 pb-space-12 pt-0 sm:pl-[4.25rem]">
                              <p className="pb-space-8 text-[11px] font-semibold uppercase leading-4 tracking-wider text-admin-ink-muted">
                                Missed clips
                              </p>
                              <ul className="flex flex-wrap gap-space-8">
                                {missed.map((clipId) => (
                                  <li
                                    key={clipId}
                                    className="rounded-admin-control border border-admin-hairline bg-admin-card px-space-8 py-1 text-admin-body-sm text-admin-ink"
                                  >
                                    {describeCatalogClip(catalog, run.lessonKey, clipId).prompt}
                                  </li>
                                ))}
                              </ul>
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
    </main>
  );
}
