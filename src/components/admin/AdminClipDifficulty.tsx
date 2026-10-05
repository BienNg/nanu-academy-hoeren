"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  ANALYTICS,
  CategoryCard,
  CountPill,
  GLASS,
  MiniBars,
  Pager,
  ScopeChips,
  SectionHeading,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  formatPercent,
  paginate,
} from "@/components/admin/AnalyticsUi";
import { describeCatalogClip, type AdminCatalogCourse } from "@/lib/admin-detail";
import { ADMIN_PAGE_SIZE } from "@/lib/admin-overview";
import {
  LISTENING_SCHEMA_HINT,
  buildAdminClipDifficultyBoard,
  clipAttempts,
  clipMissRate,
  rankClipOutcomes,
  type ClipOutcomeTotal,
  type ListeningReadStatus,
} from "@/lib/listening-runs";

type SortKey = "missRate" | "failures" | "successes" | "studentsFailed" | "attempts";
type SortDir = "asc" | "desc";

const CLIPS = ANALYTICS.indigo;
const MISSES = ANALYTICS.rose;
const PASSES = "#047857";
const HARDEST = ANALYTICS.slate;

/** Most groups shown in a card's mini bars. */
const MINI_BAR_LIMIT = 6;

const RATE_BUCKETS = [
  { key: "0", label: "0%", min: 0, max: 0 },
  { key: "25", label: "≤25%", min: 0.0001, max: 0.25 },
  { key: "50", label: "≤50%", min: 0.2501, max: 0.5 },
  { key: "75", label: "≤75%", min: 0.5001, max: 0.75 },
  { key: "100", label: "≤100%", min: 0.7501, max: 1 },
] as const;

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clipExcerpt(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 90) return trimmed;
  return `${trimmed.slice(0, 87)}…`;
}

function outcomeCount(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? singular : plural}`;
}

function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function perItem(total: number, count: number): string {
  if (count <= 0) return "—";
  const value = total / count;
  return value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

/** Colour for a miss rate: green when easy, amber in the middle, rose when hard. */
function rateColor(rate: number, attempts: number): string {
  if (attempts === 0) return ANALYTICS.axis;
  if (rate >= 0.5) return ANALYTICS.rose;
  if (rate >= 0.25) return "#f59e0b";
  return ANALYTICS.emerald;
}

function rateIcon(rate: number): string {
  if (rate >= 0.5) return "trending_up";
  if (rate >= 0.25) return "trending_flat";
  return "trending_down";
}

/** Top groups by value, for a card's mini bars. */
function topGroups(totals: ReadonlyMap<string, number>) {
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en", { sensitivity: "base" }))
    .slice(0, MINI_BAR_LIMIT)
    .map(([label, value]) => ({ key: label, label, value }));
}

function FooterAside({ label, color }: { label: string | null; color: string }) {
  return (
    <span style={{ color: label ? color : undefined }}>
      {label ? `Most in ${label}` : "Nothing yet"}
    </span>
  );
}

const RANK_STYLES = [
  "bg-[#4338ca] text-white shadow-sm",
  "bg-[#006398] text-white",
  "bg-[#dae2fd] text-[#131b2e]",
];

function ClipRankPanel({
  title,
  icon,
  color,
  hint,
  empty,
  rows,
  catalog,
  count,
  countLabel,
  students,
  tone,
}: {
  title: string;
  icon: string;
  color: string;
  hint: string;
  empty: string;
  rows: readonly ClipOutcomeTotal[];
  catalog: readonly AdminCatalogCourse[];
  count: (row: ClipOutcomeTotal) => number;
  countLabel: readonly [string, string];
  students: (row: ClipOutcomeTotal) => number;
  tone: "alert" | "good";
}) {
  const top = Math.max(1, ...rows.map(count));
  return (
    <TablePanel icon={icon} title={title} hint={hint} color={color}>
      {rows.length === 0 ? (
        <p className="flex items-center gap-space-8 px-space-20 py-space-24 font-body-md text-body-md text-on-surface-variant">
          <MaterialIcon name="hourglass_empty" className="text-[20px] text-outline" />
          {empty}
        </p>
      ) : (
        <ol>
          {rows.map((row, index) => {
            const described = describeCatalogClip(catalog, row.lessonKey, row.clipId);
            const place = described.lesson
              ? `${described.course} · ${described.lesson}`
              : described.course;
            const value = count(row);
            return (
              <li
                key={`${row.lessonKey}:${row.clipId}`}
                className={`${TR} flex items-center gap-space-12 px-space-16 py-space-12`}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-label-sm text-label-sm font-bold tabular-nums ${
                    RANK_STYLES[index] ?? "text-outline"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body-sm text-[12px] leading-[18px] text-outline">
                    {place}
                  </span>
                  <span className="mt-0.5 block font-body-md text-body-md font-semibold text-on-surface transition-colors group-hover:text-[#4338ca]">
                    {clipExcerpt(described.prompt)}
                  </span>
                  <span className="mt-1 block h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-[#eaedff]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: formatPercent(value / top), backgroundColor: color }}
                    />
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <CountPill value={value} tone={tone} />
                  <span className="whitespace-nowrap font-label-sm text-[11px] leading-4 text-on-surface-variant">
                    {outcomeCount(value, countLabel[0], countLabel[1])} ·{" "}
                    {outcomeCount(students(row), "student", "students")}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </TablePanel>
  );
}

function SortHeader({
  label,
  column,
  sort,
  dir,
  onSort,
  align = "center",
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: SortDir;
  onSort: (column: SortKey) => void;
  align?: "left" | "center";
}) {
  const active = sort === column;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={`${TH} whitespace-nowrap ${align === "left" ? "text-left" : "text-center"}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-space-4 rounded-md px-space-4 py-0.5 uppercase tracking-wider transition-colors hover:bg-[#e2e7ff] hover:text-on-surface ${
          active ? "text-[#4338ca]" : ""
        }`}
      >
        {label}
        <MaterialIcon
          name={!active ? "unfold_more" : dir === "asc" ? "arrow_upward" : "arrow_downward"}
          className={`text-[16px] ${active ? "text-[#4338ca]" : "text-outline"}`}
        />
      </button>
    </th>
  );
}

function Notice({ tone, children }: { tone: "error" | "info"; children: string }) {
  return (
    <div
      className={`${GLASS} flex items-start gap-space-12 border-l-4 p-space-16 ${
        tone === "error" ? "border-l-[#e11d48]" : "border-l-[#4338ca]"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          tone === "error" ? "bg-[#ffe4e6] text-[#e11d48]" : "bg-[#eaedff] text-[#4338ca]"
        }`}
      >
        <MaterialIcon name={tone === "error" ? "error" : "info"} className="text-[18px]" />
      </div>
      <p className="pt-1 font-body-md text-body-md text-on-surface">{children}</p>
    </div>
  );
}

export function AdminClipDifficulty({
  catalog,
  rows,
  status,
  storeConfigured,
}: {
  catalog: readonly AdminCatalogCourse[];
  rows: readonly ClipOutcomeTotal[];
  status: ListeningReadStatus;
  storeConfigured: boolean;
}) {
  const board = useMemo(() => buildAdminClipDifficultyBoard(rows), [rows]);
  const ranked = useMemo(() => rankClipOutcomes(rows), [rows]);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState<string>("all");
  const [sampled, setSampled] = useState(false);
  const [sort, setSort] = useState<SortKey>("missRate");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const labeled = useMemo(
    () =>
      rows.map((row) => {
        const described = describeCatalogClip(catalog, row.lessonKey, row.clipId);
        return {
          row,
          course: described.course,
          lesson: described.lesson,
          prompt: described.prompt,
          attempts: clipAttempts(row),
          missRate: clipMissRate(row),
        };
      }),
    [rows, catalog],
  );

  const courseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of labeled) counts.set(item.course, (counts.get(item.course) ?? 0) + 1);
    return counts;
  }, [labeled]);
  const courses = useMemo(
    () =>
      [...courseCounts.keys()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    [courseCounts],
  );

  const cardBars = useMemo(() => {
    const misses = new Map<string, number>();
    const passes = new Map<string, number>();
    const buckets = RATE_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, value: 0 }));
    let cleared = 0;
    for (const item of labeled) {
      misses.set(item.course, (misses.get(item.course) ?? 0) + item.row.failures);
      passes.set(item.course, (passes.get(item.course) ?? 0) + item.row.successes);
      if (item.row.successes > 0) cleared += 1;
      if (item.attempts === 0) continue;
      const index = RATE_BUCKETS.findIndex(
        (bucket) => item.missRate >= bucket.min && item.missRate <= bucket.max,
      );
      if (index >= 0) buckets[index].value += 1;
    }
    const hardestFive = [...labeled]
      .filter((item) => item.attempts >= 3)
      .sort((a, b) => b.missRate - a.missRate || b.row.failures - a.row.failures)
      .slice(0, 5)
      .map((item, index) => ({
        key: `${item.row.lessonKey}:${item.row.clipId}`,
        label: `#${index + 1}`,
        value: Math.round(item.missRate * 100),
      }));
    return {
      misses: topGroups(misses),
      passes: topGroups(passes),
      buckets,
      hardestFive,
      cleared,
    };
  }, [labeled]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return labeled.filter((item) => {
      if (course !== "all" && item.course !== course) return false;
      if (sampled && item.attempts < 3) return false;
      if (!needle) return true;
      const haystack = [item.prompt, item.course, item.lesson, item.row.clipId, item.row.lessonKey]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [labeled, course, sampled, query]);

  const sorted = useMemo(() => {
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let delta = 0;
      if (sort === "missRate") delta = a.missRate - b.missRate;
      else if (sort === "failures") delta = a.row.failures - b.row.failures;
      else if (sort === "successes") delta = a.row.successes - b.row.successes;
      else if (sort === "studentsFailed") delta = a.row.studentsFailed - b.row.studentsFailed;
      else delta = a.attempts - b.attempts;
      if (delta !== 0) return delta * sign;
      return a.prompt.localeCompare(b.prompt, "en", { sensitivity: "base" });
    });
  }, [filtered, sort, dir]);

  const paged = paginate(sorted, page, ADMIN_PAGE_SIZE);
  const outcomes = board.misses + board.passes;
  const missRate = share(board.misses, outcomes);
  const hardest = board.hardest
    ? describeCatalogClip(catalog, board.hardest.lessonKey, board.hardest.clipId)
    : null;
  const hardestRate = board.hardest ? clipMissRate(board.hardest) : 0;
  const hardestAttempts = board.hardest ? clipAttempts(board.hardest) : 0;
  const busiestBucket = [...cardBars.buckets].sort((a, b) => b.value - a.value)[0];
  const courseOptions = [
    { key: "all", label: "All courses", count: formatCount(labeled.length) },
    ...courses.map((name) => ({
      key: name,
      label: name,
      count: formatCount(courseCounts.get(name) ?? 0),
    })),
  ];

  function handleSort(column: SortKey) {
    if (sort === column) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir("desc");
    }
    setPage(1);
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-space-24 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Learning"
        title="Practice clip difficulty"
        subtitle="All-time misses and passes from finished practice parts. A miss that is later corrected counts on both sides."
        trailing={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e2e7ff] px-space-12 py-1 font-label-sm text-label-sm font-semibold text-on-surface-variant">
            <MaterialIcon name="all_inclusive" className="text-[16px] text-[#4338ca]" />
            All-time totals
          </span>
        }
      />

      {!storeConfigured ? (
        <Notice tone="error">Cloud progress is not configured. Clip results live in Supabase.</Notice>
      ) : status === "missing" ? (
        <Notice tone="info">{LISTENING_SCHEMA_HINT}</Notice>
      ) : status === "error" ? (
        <Notice tone="error">Clip results could not be loaded.</Notice>
      ) : null}

      <section aria-labelledby="clips-glance" className="flex flex-col gap-space-12">
        <SectionHeading
          id="clips-glance"
          icon="grid_view"
          title="At a glance"
          meta={`${formatCount(outcomes)} outcomes stored`}
        />
        <div className="grid grid-cols-1 gap-space-16 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-space-20">
          <CategoryCard
            icon="graphic_eq"
            title="Clips"
            hint="Appear in a finished part"
            color={CLIPS}
            value={formatCount(board.clips)}
            unit="with results"
            badge={`${formatPercent(share(board.withMisses, board.clips))} missed`}
            progress={share(board.withMisses, board.clips)}
            progressLabel="Share of clips missed at least once"
            metrics={[
              { icon: "priority_high", label: "Missed clips", value: formatCount(board.withMisses) },
              { icon: "functions", label: "Outcomes", value: formatCount(outcomes) },
            ]}
            footerLabel="Clips by miss rate"
            footerAside={
              <span style={{ color: busiestBucket?.value ? CLIPS : undefined }}>
                {busiestBucket?.value ? `Most at ${busiestBucket.label}` : "Nothing yet"}
              </span>
            }
          >
            <MiniBars items={cardBars.buckets} color={CLIPS} />
          </CategoryCard>
          <CategoryCard
            icon="heart_broken"
            title="Misses"
            hint="Wrong at least once in a part"
            color={MISSES}
            value={formatCount(board.misses)}
            unit="misses"
            badge={`${formatPercent(missRate)} miss rate`}
            progress={missRate}
            progressLabel="Overall miss rate"
            metrics={[
              { icon: "group_off", label: "Missed clips", value: formatCount(board.withMisses) },
              { icon: "functions", label: "Per clip", value: perItem(board.misses, board.clips) },
            ]}
            footerLabel="Misses by course"
            footerAside={
              <FooterAside label={cardBars.misses.find((bar) => bar.value > 0)?.label ?? null} color={MISSES} />
            }
          >
            <MiniBars items={cardBars.misses} color={MISSES} />
          </CategoryCard>
          <CategoryCard
            icon="check_circle"
            title="Passes"
            hint="Cleared in a finished part"
            color={PASSES}
            value={formatCount(board.passes)}
            unit="passes"
            badge={`${formatPercent(share(board.passes, outcomes))} pass rate`}
            progress={share(board.passes, outcomes)}
            progressLabel="Overall pass rate"
            metrics={[
              { icon: "task_alt", label: "Cleared clips", value: formatCount(cardBars.cleared) },
              { icon: "functions", label: "Per clip", value: perItem(board.passes, board.clips) },
            ]}
            footerLabel="Passes by course"
            footerAside={
              <FooterAside label={cardBars.passes.find((bar) => bar.value > 0)?.label ?? null} color={PASSES} />
            }
          >
            <MiniBars items={cardBars.passes} color={PASSES} />
          </CategoryCard>
          <CategoryCard
            icon="local_fire_department"
            title="Hardest"
            hint={hardest ? clipExcerpt(hardest.prompt) : "Needs three stored outcomes"}
            color={HARDEST}
            value={board.hardest ? formatRate(hardestRate) : "—"}
            unit="miss rate"
            badge={outcomeCount(hardestAttempts, "outcome", "outcomes")}
            badgeTone={hardestRate >= 0.5 ? "alert" : "accent"}
            progress={hardestRate}
            progressLabel="Miss rate of the hardest clip"
            metrics={[
              {
                icon: "heart_broken",
                label: "Misses",
                value: formatCount(board.hardest?.failures ?? 0),
              },
              {
                icon: "person",
                label: "Students missed",
                value: formatCount(board.hardest?.studentsFailed ?? 0),
              },
            ]}
            footerLabel="Top 5 miss rates (3+ outcomes)"
            footerAside={
              hardest?.lesson ? (
                <span className="block max-w-[8rem] truncate">{hardest.lesson}</span>
              ) : null
            }
          >
            <MiniBars items={cardBars.hardestFive} color={HARDEST} />
          </CategoryCard>
        </div>
      </section>

      {storeConfigured && status === "ready" ? (
        <section aria-labelledby="clips-ranked" className="flex flex-col gap-space-12">
          <SectionHeading
            id="clips-ranked"
            icon="leaderboard"
            title="Practice clips"
            meta="A clip missed and then corrected counts in both lists"
          />
          <div className="grid grid-cols-1 gap-space-16 lg:grid-cols-2 2xl:gap-space-20">
            <ClipRankPanel
              title="Failed most"
              icon="heart_broken"
              color={MISSES}
              hint="Clips with the most misses across every student."
              empty="No clip has been missed yet."
              rows={ranked.failed}
              catalog={catalog}
              count={(row) => row.failures}
              countLabel={["miss", "misses"]}
              students={(row) => row.studentsFailed}
              tone="alert"
            />
            <ClipRankPanel
              title="Succeeded most"
              icon="check_circle"
              color={PASSES}
              hint="Clips cleared most often across every student."
              empty="No clip has been passed yet."
              rows={ranked.succeeded}
              catalog={catalog}
              count={(row) => row.successes}
              countLabel={["pass", "passes"]}
              students={(row) => row.studentsPassed}
              tone="good"
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="clips-all" className="flex flex-col gap-space-12">
        <SectionHeading
          id="clips-all"
          icon="table_rows"
          title="Every clip with data"
          meta="Miss rate is misses ÷ (misses + passes)"
        />
        {courses.length > 1 ? (
          <ScopeChips
            label="Course"
            icon="school"
            ariaLabel="Filter by course"
            value={course}
            options={courseOptions}
            onSelect={(key) => {
              setCourse(key);
              setPage(1);
            }}
          />
        ) : null}
        <TablePanel
          icon="graphic_eq"
          title="Clip results"
          hint="Sort any column. Turn on “3+ outcomes” to hide clips with too little data to judge."
          trailing={
            <div className="flex w-full flex-wrap items-center gap-space-8 sm:w-auto">
              <label className="relative flex min-w-0 flex-1 items-center rounded-xl bg-white px-space-12 py-1.5 shadow-sm sm:w-72 sm:flex-none">
                <span className="sr-only">Search clips</span>
                <MaterialIcon name="search" className="mr-space-4 text-[18px] text-outline" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search script, lesson, or clip id"
                  className="w-full bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline"
                />
              </label>
              <label
                className={`inline-flex cursor-pointer items-center gap-space-8 rounded-xl px-space-12 py-1.5 font-label-sm text-label-sm font-semibold shadow-sm transition-colors ${
                  sampled ? "bg-[#4338ca] text-white" : "bg-white text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <input
                  type="checkbox"
                  checked={sampled}
                  onChange={(event) => {
                    setSampled(event.target.checked);
                    setPage(1);
                  }}
                  className="sr-only"
                />
                <MaterialIcon
                  name={sampled ? "check_box" : "check_box_outline_blank"}
                  className="text-[18px]"
                />
                3+ outcomes
              </label>
            </div>
          }
          footer={
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              start={paged.start}
              end={paged.end}
              total={sorted.length}
              noun="clips"
              onPage={setPage}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead className={THEAD}>
                <tr>
                  <th scope="col" className={`${TH} min-w-[18rem]`}>
                    Clip
                  </th>
                  <SortHeader
                    label="Miss rate"
                    column="missRate"
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    align="left"
                  />
                  <SortHeader label="Misses" column="failures" sort={sort} dir={dir} onSort={handleSort} />
                  <SortHeader label="Passes" column="successes" sort={sort} dir={dir} onSort={handleSort} />
                  <SortHeader
                    label="Students missed"
                    column="studentsFailed"
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                  />
                  <SortHeader label="Outcomes" column="attempts" sort={sort} dir={dir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {paged.pageItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                    >
                      <span className="inline-flex items-center gap-space-8">
                        <MaterialIcon name="search_off" className="text-[20px] text-outline" />
                        {rows.length === 0
                          ? "No finished practice parts have clip results yet."
                          : "No clips match this filter."}
                      </span>
                    </td>
                  </tr>
                ) : (
                  paged.pageItems.map((item) => {
                    const color = rateColor(item.missRate, item.attempts);
                    return (
                      <tr key={`${item.row.lessonKey}:${item.row.clipId}`} className={TR}>
                        <td className="px-space-16 py-space-12">
                          <div className="flex items-center gap-space-12">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                              style={{ backgroundColor: `${color}1a`, color }}
                              aria-hidden="true"
                            >
                              <MaterialIcon name={rateIcon(item.missRate)} className="text-[18px]" />
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <span className="font-semibold text-on-surface transition-colors group-hover:text-[#4338ca]">
                                {clipExcerpt(item.prompt)}
                              </span>
                              <span className="truncate font-body-sm text-[12px] leading-[18px] text-outline">
                                {item.lesson ? `${item.course} · ${item.lesson}` : item.course}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-space-16 py-space-12">
                          <div className="flex w-full min-w-[8rem] max-w-[10rem] flex-col gap-1">
                            <span className="font-label-sm text-label-sm font-bold tabular-nums" style={{ color }}>
                              {formatRate(item.missRate)}
                            </span>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[#eaedff]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: formatPercent(item.missRate), backgroundColor: color }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-space-16 py-space-12 text-center">
                          <CountPill value={item.row.failures} tone="alert" />
                        </td>
                        <td className="px-space-16 py-space-12 text-center">
                          <CountPill value={item.row.successes} tone="good" />
                        </td>
                        <td className="px-space-16 py-space-12 text-center">
                          <CountPill value={item.row.studentsFailed} />
                        </td>
                        <td className="px-space-16 py-space-12 text-center font-label-sm text-label-sm font-semibold tabular-nums text-on-surface-variant">
                          {formatCount(item.attempts)}
                        </td>
                      </tr>
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
