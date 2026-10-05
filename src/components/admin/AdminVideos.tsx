"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  type AdminVideoBoard,
  type AdminVideoWatchRow,
} from "@/lib/admin-catalog";
import { ADMIN_PAGE_SIZE } from "@/lib/admin-overview";

type SortKey = "title" | "watched" | "started" | "lesson";
type SortDir = "asc" | "desc";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
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
  align = "left",
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: SortDir;
  align?: "left" | "right";
  onSort: (column: SortKey) => void;
}) {
  const active = sort === column;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`whitespace-nowrap px-space-12 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant ${
        align === "right" ? "text-right" : "text-left"
      }`}
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

export function AdminVideos({
  board,
  storeConfigured,
}: {
  board: AdminVideoBoard;
  storeConfigured: boolean;
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string | "all">("all");
  const [untouchedOnly, setUntouchedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("watched");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const levels = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of board.rows) seen.set(row.levelSlug, row.levelLabel);
    return [...seen.entries()].map(([slug, label]) => ({ slug, label }));
  }, [board.rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return board.rows.filter((row) => {
      if (level !== "all" && row.levelSlug !== level) return false;
      if (untouchedOnly && (row.watched > 0 || row.started > 0 || !row.videoId)) return false;
      if (!needle) return true;
      const haystack = [row.title, row.lesson, row.levelLabel, row.videoId, row.url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [board.rows, level, untouchedOnly, query]);

  const sorted = useMemo(() => {
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let delta = 0;
      if (sort === "watched") delta = a.watched - b.watched;
      else if (sort === "started") delta = a.started - b.started;
      else if (sort === "lesson") {
        delta = a.levelLabel.localeCompare(b.levelLabel, "en", { sensitivity: "base" });
        if (delta === 0) delta = a.lesson.localeCompare(b.lesson, "en", { sensitivity: "base" });
      } else {
        delta = a.title.localeCompare(b.title, "en", { sensitivity: "base" });
      }
      if (delta !== 0) return delta * sign;
      return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
    });
  }, [filtered, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * ADMIN_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * ADMIN_PAGE_SIZE, sorted.length);

  function handleSort(column: SortKey) {
    if (sort === column) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir(column === "title" || column === "lesson" ? "asc" : "desc");
    }
    setPage(1);
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Learning"
        title="Videos"
        subtitle="Each YouTube on a Lektion, and how many synced students marked it watched. Totals are all-time, not the date pill."
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. Watch counts need learners synced to Supabase.
        </div>
      ) : null}

      <section
        aria-label="Video totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Listed"
          value={formatCount(board.listed)}
          icon="smart_display"
          hint="Videos attached to a Lektion"
        />
        <SummaryStat
          label="Playable"
          value={formatCount(board.playable)}
          icon="play_circle"
          hint="URLs that parse as YouTube"
        />
        <SummaryStat
          label="Broken"
          value={formatCount(board.broken)}
          icon="link_off"
          hint="Title present, URL not a YouTube id"
        />
        <SummaryStat
          label="Watched"
          value={formatCount(board.watchedOnce)}
          icon="visibility"
          hint="Playable videos marked watched by someone"
        />
        <SummaryStat
          label="Untouched"
          value={formatCount(board.untouched)}
          icon="visibility_off"
          hint="Playable, nobody started or watched"
        />
      </section>

      <section className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-space-12 px-space-16 py-space-12">
          <div>
            <h2 className="font-label-md text-label-md font-semibold text-on-surface">
              Lesson videos
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
              Started means they have a playback position but have not marked watched.
            </p>
          </div>
          <div className="flex flex-col gap-space-12 lg:flex-row lg:items-center">
            <label className="relative w-full max-w-md">
              <span className="sr-only">Search videos</span>
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
                placeholder="Search title, lesson, or video id"
                className="h-11 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest py-space-8 pl-10 pr-space-16 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed"
              />
            </label>
            <label className="inline-flex h-11 cursor-pointer items-center gap-space-8 rounded-2xl border border-outline-variant/40 px-space-16 font-label-sm text-label-sm font-semibold text-on-surface">
              <input
                type="checkbox"
                checked={untouchedOnly}
                onChange={(event) => {
                  setUntouchedOnly(event.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 accent-primary"
              />
              Untouched only
            </label>
          </div>
          {levels.length > 1 ? (
            <div role="tablist" aria-label="Filter by level" className="flex flex-wrap gap-space-8">
              <button
                type="button"
                role="tab"
                aria-selected={level === "all"}
                onClick={() => {
                  setLevel("all");
                  setPage(1);
                }}
                className={`inline-flex h-9 items-center rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                  level === "all"
                    ? "bg-primary text-on-primary"
                    : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                }`}
              >
                All
              </button>
              {levels.map((item) => {
                const on = level === item.slug;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setLevel(item.slug);
                      setPage(1);
                    }}
                    className={`inline-flex h-9 items-center rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                      on
                        ? "bg-primary text-on-primary"
                        : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {item.label}
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
                <SortHeader
                  label="Video"
                  column="title"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Lesson"
                  column="lesson"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Watched"
                  column="watched"
                  sort={sort}
                  dir={dir}
                  align="right"
                  onSort={handleSort}
                />
                <SortHeader
                  label="Started"
                  column="started"
                  sort={sort}
                  dir={dir}
                  align="right"
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                  >
                    {board.rows.length === 0
                      ? "No lesson videos are listed yet."
                      : "No videos match this filter."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <VideoRow key={row.key} row={row} />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-12 border-t border-outline-variant/20 px-space-16 py-space-12">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {sorted.length === 0
              ? "0 videos"
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

function VideoRow({ row }: { row: AdminVideoWatchRow }) {
  const playable = Boolean(row.videoId);
  return (
    <tr className="border-t border-outline-variant/20 font-body-sm text-body-sm text-on-surface">
      <td className="px-space-16 py-space-16">
        <p className="font-label-md text-label-md font-semibold text-on-surface">{row.title}</p>
        {playable ? (
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-space-4 font-caption text-caption text-primary hover:underline"
          >
            YouTube
            <MaterialIcon name="open_in_new" className="text-[14px]" />
          </a>
        ) : (
          <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
            URL is not a YouTube id
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-space-12 py-space-16 text-on-surface-variant">
        {row.levelLabel} · {row.lesson}
      </td>
      <td className="px-space-12 py-space-16 text-right tabular-nums font-medium">
        {playable ? formatCount(row.watched) : "—"}
      </td>
      <td className="px-space-12 py-space-16 text-right tabular-nums">
        {playable ? formatCount(row.started) : "—"}
      </td>
    </tr>
  );
}
