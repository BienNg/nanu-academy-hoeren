"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  Checkbox,
  INPUT,
  KpiTile,
  Mono,
  Pager,
  ScopeChips,
  SortHeader,
  THEAD,
  TR,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
import {
  type AdminVideoBoard,
  type AdminVideoWatchRow,
} from "@/lib/admin-catalog";
import { ADMIN_PAGE_SIZE } from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

type SortKey = "title" | "watched" | "started" | "lesson";
type SortDir = "asc" | "desc";

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

  const levelChips = [
    { key: "all", label: "All", count: board.rows.length },
    ...levels.map((item) => ({
      key: item.slug,
      label: item.label,
      count: board.rows.filter((row) => row.levelSlug === item.slug).length,
    })),
  ];

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Learning"
        title="Videos"
        subtitle="Each YouTube on a Lektion, and how many synced students marked it watched. Totals are all-time, not the date pill."
      />

      {!storeConfigured ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-16 py-space-12 text-admin-body-sm text-admin-crimson-ink">
          Cloud progress is not configured. Watch counts need learners synced to Supabase.
        </div>
      ) : null}

      <section
        aria-label="Video totals"
        className="grid grid-cols-2 gap-space-16 md:grid-cols-3 xl:grid-cols-5"
      >
        <KpiTile
          icon="smart_display"
          label="Listed"
          value={formatCount(board.listed)}
          caption="Videos attached to a Lektion"
          color={ADMIN_COLORS.violet}
        />
        <KpiTile
          icon="play_circle"
          label="Playable"
          value={formatCount(board.playable)}
          caption="URLs that parse as YouTube"
          color={ADMIN_COLORS.violet}
          progress={board.listed > 0 ? board.playable / board.listed : 0}
          progressLabel="Share of listed videos that play"
        />
        <KpiTile
          icon="link_off"
          label="Broken"
          value={formatCount(board.broken)}
          caption="Title present, URL not a YouTube id"
          color={board.broken > 0 ? ADMIN_COLORS.crimson : ADMIN_COLORS.inkSubtle}
        />
        <KpiTile
          icon="visibility"
          label="Watched"
          value={formatCount(board.watchedOnce)}
          caption="Playable videos someone marked watched"
          color={ADMIN_COLORS.violet}
          progress={board.playable > 0 ? board.watchedOnce / board.playable : 0}
          progressLabel="Share of playable videos watched by someone"
        />
        <KpiTile
          icon="visibility_off"
          label="Untouched"
          value={formatCount(board.untouched)}
          caption="Playable, nobody started or watched"
          color={board.untouched > 0 ? ADMIN_COLORS.amber : ADMIN_COLORS.inkSubtle}
        />
      </section>

      <TablePanel
        icon="smart_display"
        title="Lesson videos"
        hint="Started means they have a playback position but have not marked watched."
        color={ADMIN_COLORS.violet}
        footer={
          <Pager
            page={safePage}
            pageCount={pageCount}
            start={rangeStart}
            end={rangeEnd}
            total={sorted.length}
            noun="videos"
            onPage={setPage}
          />
        }
      >
        <div className="flex flex-col gap-space-12 border-b border-admin-hairline px-space-16 py-space-12 sm:px-space-20">
          <div className="flex flex-col gap-space-12 sm:flex-row sm:items-center">
            <label className="relative flex w-full max-w-md items-center">
              <span className="sr-only">Search videos</span>
              <MaterialIcon
                name="search"
                className="pointer-events-none absolute left-space-12 text-[18px] text-admin-ink-faint"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search title, lesson, or video id"
                className={`${INPUT} pl-9`}
              />
            </label>
            <label
              className={`inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-space-8 rounded-admin-control border px-space-12 text-admin-label-md font-semibold transition-colors has-[:focus-visible]:shadow-admin-focus ${
                untouchedOnly
                  ? "border-admin-amber bg-admin-amber-wash text-admin-amber-ink"
                  : "border-admin-hairline bg-admin-card text-admin-ink-muted hover:border-admin-border"
              }`}
            >
              <Checkbox
                checked={untouchedOnly}
                onChange={(event) => {
                  setUntouchedOnly(event.target.checked);
                  setPage(1);
                }}
              />
              Untouched only
            </label>
          </div>
          {levels.length > 1 ? (
            <ScopeChips
              label="Level"
              icon="stairs"
              ariaLabel="Filter by level"
              tone="amber"
              value={level}
              options={levelChips}
              onSelect={(key) => {
                setLevel(key);
                setPage(1);
              }}
            />
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <SortHeader label="Video" column="title" sort={sort} dir={dir} onSort={handleSort} />
                <SortHeader label="Lesson" column="lesson" sort={sort} dir={dir} onSort={handleSort} />
                <SortHeader label="Watched" column="watched" sort={sort} dir={dir} align="right" onSort={handleSort} />
                <SortHeader label="Started" column="started" sort={sort} dir={dir} align="right" onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted">
                    {board.rows.length === 0 ? "No lesson videos are listed yet." : "No videos match this filter."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => <VideoRow key={row.key} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </TablePanel>
    </main>
  );
}

function VideoRow({ row }: { row: AdminVideoWatchRow }) {
  const playable = Boolean(row.videoId);
  return (
    <tr className={TR}>
      <td className="px-space-16 py-space-8">
        <p className="font-semibold text-admin-ink">{row.title}</p>
        {playable ? (
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-space-4 rounded-admin-badge text-admin-cobalt outline-none hover:underline focus-visible:shadow-admin-focus"
          >
            <Mono>{row.videoId}</Mono>
            <MaterialIcon name="open_in_new" className="text-[14px]" />
          </a>
        ) : (
          <p className="mt-0.5 flex items-center gap-space-4 text-[12px] leading-4 text-admin-crimson-ink">
            <MaterialIcon name="link_off" className="text-[14px]" />
            URL is not a YouTube id
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-space-16 py-space-8 text-admin-body-sm text-admin-ink-muted">
        {row.levelLabel} · {row.lesson}
      </td>
      <td
        className={`px-space-16 py-space-8 text-right font-semibold tabular-nums ${
          playable && row.watched > 0 ? "text-admin-violet-ink" : "text-admin-ink-faint"
        }`}
      >
        {playable ? formatCount(row.watched) : "—"}
      </td>
      <td className="px-space-16 py-space-8 text-right tabular-nums text-admin-ink-muted">
        {playable ? formatCount(row.started) : "—"}
      </td>
    </tr>
  );
}
