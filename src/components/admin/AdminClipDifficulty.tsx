"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
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

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

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

function ClipRankPanel({
  title,
  icon,
  empty,
  rows,
  catalog,
  count,
  countLabel,
  students,
}: {
  title: string;
  icon: string;
  empty: string;
  rows: readonly ClipOutcomeTotal[];
  catalog: readonly AdminCatalogCourse[];
  count: (row: ClipOutcomeTotal) => number;
  countLabel: readonly [string, string];
  students: (row: ClipOutcomeTotal) => number;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="flex items-center gap-space-8 border-b border-outline-variant/20 px-space-16 py-space-12">
        <MaterialIcon name={icon} className="text-[20px] text-primary" />
        <h3 className="font-label-md text-label-md font-semibold text-on-surface">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          {empty}
        </p>
      ) : (
        <ol>
          {rows.map((row, index) => {
            const described = describeCatalogClip(catalog, row.lessonKey, row.clipId);
            const place = described.lesson
              ? `${described.course} · ${described.lesson}`
              : described.course;
            const studentCount = students(row);
            return (
              <li
                key={`${row.lessonKey}:${row.clipId}`}
                className="flex items-start gap-space-12 border-b border-outline-variant/15 px-space-16 py-space-12 last:border-b-0"
              >
                <span className="mt-0.5 w-5 shrink-0 font-label-sm text-label-sm font-semibold tabular-nums text-outline">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-caption text-caption text-on-surface-variant">
                    {place}
                  </span>
                  <span className="mt-0.5 block font-body-sm text-body-sm text-on-surface">
                    {clipExcerpt(described.prompt)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-label-sm text-label-sm font-semibold tabular-nums text-on-surface">
                    {outcomeCount(count(row), countLabel[0], countLabel[1])}
                  </span>
                  <span className="mt-0.5 block font-caption text-caption text-on-surface-variant">
                    {outcomeCount(studentCount, "student", "students")}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ListeningClipSection({
  catalog,
  status,
  rows,
}: {
  catalog: readonly AdminCatalogCourse[];
  status: ListeningReadStatus;
  rows: readonly ClipOutcomeTotal[];
}) {
  const ranked = useMemo(() => rankClipOutcomes(rows), [rows]);

  return (
    <section aria-label="Practice clips" className="flex flex-col gap-space-12">
      <div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Practice clips</h2>
        <p className="font-caption text-caption text-on-surface-variant">
          All-time totals across every student. A clip they miss and then correct counts in
          both lists.
        </p>
      </div>
      {status === "missing" ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-space-20 py-space-16 font-body-sm text-body-sm text-on-surface-variant">
          {LISTENING_SCHEMA_HINT}
        </div>
      ) : status === "error" ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Clip results could not be loaded.
        </div>
      ) : (
        <div className="grid gap-space-12 lg:grid-cols-2">
          <ClipRankPanel
            title="Failed most"
            icon="heart_broken"
            empty="No clip has been missed yet."
            rows={ranked.failed}
            catalog={catalog}
            count={(row) => row.failures}
            countLabel={["miss", "misses"]}
            students={(row) => row.studentsFailed}
          />
          <ClipRankPanel
            title="Succeeded most"
            icon="check_circle"
            empty="No clip has been passed yet."
            rows={ranked.succeeded}
            catalog={catalog}
            count={(row) => row.successes}
            countLabel={["pass", "passes"]}
            students={(row) => row.studentsPassed}
          />
        </div>
      )}
    </section>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-space-16 shadow-sm">
      <div className="flex items-center gap-space-8">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed">
          <MaterialIcon name={icon} className="text-[18px]" />
        </div>
        <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
      </div>
      <p className="mt-space-12 font-headline-lg text-headline-lg tabular-nums text-on-surface">
        {value}
      </p>
      <p className="mt-1 font-caption text-caption text-on-surface-variant">{hint}</p>
    </div>
  );
}

function SortHeader({
  label,
  column,
  sort,
  dir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: SortDir;
  onSort: (column: SortKey) => void;
}) {
  const active = sort === column;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="whitespace-nowrap px-space-12 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-space-4 rounded-md px-space-4 py-0.5 transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        {label}
        <MaterialIcon
          name={!active ? "unfold_more" : dir === "asc" ? "arrow_upward" : "arrow_downward"}
          className={`text-[16px] ${active ? "text-primary" : "text-outline"}`}
        />
      </button>
    </th>
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
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState<string | "all">("all");
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

  const courses = useMemo(() => {
    const names = new Set<string>();
    for (const item of labeled) names.add(item.course);
    return [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
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

  const pageCount = Math.max(1, Math.ceil(sorted.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * ADMIN_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * ADMIN_PAGE_SIZE, sorted.length);

  const hardest = board.hardest
    ? describeCatalogClip(catalog, board.hardest.lessonKey, board.hardest.clipId)
    : null;

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
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Learning"
        title="Practice clip difficulty"
        subtitle="All-time misses and passes from finished practice parts. A miss that is later corrected counts on both sides."
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. Clip results live in Supabase.
        </div>
      ) : null}

      {storeConfigured && status === "missing" ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          {LISTENING_SCHEMA_HINT}
        </div>
      ) : null}

      {storeConfigured && status === "error" ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Clip results could not be loaded.
        </div>
      ) : null}

      <section
        aria-label="Practice clip difficulty totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Clips"
          value={formatCount(board.clips)}
          icon="graphic_eq"
          hint="Clips that appear in a finished part"
        />
        <SummaryStat
          label="Misses"
          value={formatCount(board.misses)}
          icon="heart_broken"
          hint="Times a clip was wrong at least once"
        />
        <SummaryStat
          label="Passes"
          value={formatCount(board.passes)}
          icon="check_circle"
          hint="Times a clip was cleared"
        />
        <SummaryStat
          label="Missed clips"
          value={formatCount(board.withMisses)}
          icon="priority_high"
          hint="Clips with at least one miss"
        />
        <SummaryStat
          label="Hardest"
          value={board.hardest ? formatRate(clipMissRate(board.hardest)) : "—"}
          icon="trending_up"
          hint={
            hardest
              ? clipExcerpt(hardest.prompt)
              : "Needs three stored outcomes before ranking"
          }
        />
      </section>

      {storeConfigured ? (
        <ListeningClipSection catalog={catalog} status={status} rows={rows} />
      ) : null}

      <section className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-space-12 px-space-16 py-space-12">
          <div>
            <h2 className="font-label-md text-label-md font-semibold text-on-surface">
              Every clip with data
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
              Miss rate is misses ÷ (misses + passes).
            </p>
          </div>
          <div className="flex flex-col gap-space-12 lg:flex-row lg:items-center">
            <label className="relative w-full max-w-md">
              <span className="sr-only">Search clips</span>
              <MaterialIcon
                name="search"
                className="pointer-events-none absolute left-space-12 top-1/2 -translate-y-1/2 text-[20px] text-outline"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search script, lesson, or clip id"
                className="h-11 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest py-space-8 pl-10 pr-space-16 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed"
              />
            </label>
            <label className="inline-flex h-11 cursor-pointer items-center gap-space-8 rounded-2xl border border-outline-variant/40 px-space-16 font-label-sm text-label-sm font-semibold text-on-surface">
              <input
                type="checkbox"
                checked={sampled}
                onChange={(event) => {
                  setSampled(event.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 accent-primary"
              />
              At least 3 outcomes
            </label>
          </div>
          {courses.length > 1 ? (
            <div role="tablist" aria-label="Filter by course" className="flex flex-wrap gap-space-8">
              <button
                type="button"
                role="tab"
                aria-selected={course === "all"}
                onClick={() => {
                  setCourse("all");
                  setPage(1);
                }}
                className={`inline-flex h-9 items-center rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                  course === "all"
                    ? "bg-primary text-on-primary"
                    : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                }`}
              >
                All
              </button>
              {courses.map((name) => {
                const on = course === name;
                return (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setCourse(name);
                      setPage(1);
                    }}
                    className={`inline-flex h-9 items-center rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                      on
                        ? "bg-primary text-on-primary"
                        : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Clip
                </th>
                <SortHeader
                  label="Miss rate"
                  column="missRate"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Misses"
                  column="failures"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Passes"
                  column="successes"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Students missed"
                  column="studentsFailed"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Outcomes"
                  column="attempts"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                  >
                    {rows.length === 0
                      ? "No finished practice parts have clip results yet."
                      : "No clips match this filter."}
                  </td>
                </tr>
              ) : (
                pageRows.map((item) => (
                  <tr
                    key={`${item.row.lessonKey}:${item.row.clipId}`}
                    className="border-t border-outline-variant/20 font-body-sm text-body-sm text-on-surface"
                  >
                    <td className="px-space-16 py-space-16">
                      <p className="font-caption text-caption text-on-surface-variant">
                        {item.lesson ? `${item.course} · ${item.lesson}` : item.course}
                      </p>
                      <p className="mt-0.5 font-label-md text-label-md font-semibold text-on-surface">
                        {clipExcerpt(item.prompt)}
                      </p>
                    </td>
                    <td className="px-space-12 py-space-16 text-right tabular-nums font-medium">
                      {formatRate(item.missRate)}
                    </td>
                    <td className="px-space-12 py-space-16 text-right tabular-nums">
                      {formatCount(item.row.failures)}
                    </td>
                    <td className="px-space-12 py-space-16 text-right tabular-nums">
                      {formatCount(item.row.successes)}
                    </td>
                    <td className="px-space-12 py-space-16 text-right tabular-nums">
                      {formatCount(item.row.studentsFailed)}
                    </td>
                    <td className="px-space-12 py-space-16 text-right tabular-nums">
                      {formatCount(item.attempts)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-12 border-t border-outline-variant/20 px-space-16 py-space-12">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {sorted.length === 0
              ? "0 clips"
              : `${rangeStart}–${rangeEnd} of ${sorted.length}`}
          </p>
          <div className="flex items-center gap-space-8">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container disabled:text-outline"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container disabled:text-outline"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
