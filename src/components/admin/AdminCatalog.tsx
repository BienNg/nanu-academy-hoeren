"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  Badge,
  CategoryCard,
  CountPill,
  CARD,
  MiniBars,
  Pager,
  ScopeChips,
  SectionHeading,
  StatusPill,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  formatPercent,
  paginate,
  HeaderChip,
} from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import {
  type AdminCatalogBoard,
  type AdminCatalogLessonStatus,
  type AdminCatalogLevelRow,
} from "@/lib/admin-catalog";

/** Rows per page in the lesson and profession tables. */
const CATALOG_PAGE_SIZE = 10;

const LESSONS = ADMIN_COLORS.emerald;
const CLIPS = ADMIN_COLORS.violet;
const VIDEOS = ADMIN_COLORS.violetSoft;
const INTERVIEW = ADMIN_COLORS.cobalt;

const STATUS: Record<
  AdminCatalogLessonStatus,
  { label: string; tone: "good" | "warn" | "bad" | "muted"; icon: string }
> = {
  ready: { label: "Ready", tone: "good", icon: "check_circle" },
  silent: { label: "No audio", tone: "warn", icon: "volume_off" },
  stub: { label: "Empty", tone: "muted", icon: "draft" },
  missing: { label: "Not on disk", tone: "bad", icon: "error" },
};

const STATUS_COLOR: Record<AdminCatalogLessonStatus, string> = {
  ready: ADMIN_COLORS.emerald,
  silent: ADMIN_COLORS.amber,
  stub: ADMIN_COLORS.inkFaint,
  missing: ADMIN_COLORS.crimson,
};

function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function perItem(total: number, count: number): string {
  if (count <= 0) return "—";
  const value = total / count;
  return value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

/** The label of the biggest item, or null when everything is zero. */
function topLabel(items: readonly { label: string; value: number }[]): string | null {
  let best: { label: string; value: number } | null = null;
  for (const item of items) {
    if (item.value > 0 && (!best || item.value > best.value)) best = item;
  }
  return best?.label ?? null;
}

function FooterAside({ label, color }: { label: string | null; color: string }) {
  return (
    <span style={{ color: label ? color : undefined }}>
      {label ? `Most in ${label}` : "Nothing yet"}
    </span>
  );
}

/** Stacked bar of lesson statuses for one level. */
function StatusBar({ level }: { level: AdminCatalogLevelRow }) {
  const counts = (Object.keys(STATUS) as AdminCatalogLessonStatus[]).map((status) => ({
    status,
    count: level.lessons.filter((lesson) => lesson.status === status).length,
  }));
  const total = level.lessons.length;
  return (
    <div className="flex flex-col gap-space-8">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-admin-subtle">
        {counts.map(({ status, count }) =>
          count > 0 ? (
            <div
              key={status}
              className="h-full"
              style={{ width: formatPercent(share(count, total)), backgroundColor: STATUS_COLOR[status] }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-space-12 gap-y-1 text-[11px] leading-4 text-admin-ink-muted">
        {counts.map(({ status, count }) => (
          <li key={status} className="flex items-center gap-space-4">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[status] }}
              aria-hidden="true"
            />
            {STATUS[status].label}
            <span className="font-semibold tabular-nums text-admin-ink">{formatCount(count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LessonTable({ level }: { level: AdminCatalogLevelRow }) {
  const [page, setPage] = useState(1);
  const topClips = Math.max(0, ...level.lessons.map((lesson) => lesson.playableClips));
  const paged = paginate(level.lessons, page, CATALOG_PAGE_SIZE);
  return (
    <TablePanel
      icon="menu_book"
      title={`${level.label} lessons`}
      hint={`${formatCount(level.readyLessons)} of ${formatCount(level.listedLessons)} playable. Clips count files learners can hear.`}
      trailing={
        <div className="w-full sm:w-72">
          <StatusBar level={level} />
        </div>
      }
      footer={
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          start={paged.start}
          end={paged.end}
          total={level.lessons.length}
          noun={`${level.label} lessons`}
          onPage={setPage}
        />
      }
    >
      {level.lessons.length === 0 ? (
        <p className="flex items-center gap-space-8 px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
          <MaterialIcon name="folder_off" className="text-[20px] text-admin-ink-subtle" />
          No lessons are listed for {level.label} yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={`${TH} min-w-[14rem]`}>Lesson</th>
                <th className={TH}>Status</th>
                <th className={`${TH} min-w-[12rem]`}>Playable clips</th>
                <th className={`${TH} text-center`}>No audio</th>
                <th className={`${TH} text-center`}>Videos</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {paged.pageItems.map((lesson) => {
                const status = STATUS[lesson.status];
                const ready = lesson.status === "ready";
                return (
                  <tr key={lesson.id} className={TR}>
                    <td className="px-space-16 py-space-12">
                      <div className="flex items-center gap-space-12">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-admin-control"
                          style={{
                            backgroundColor: `${STATUS_COLOR[lesson.status]}14`,
                            color: STATUS_COLOR[lesson.status],
                          }}
                          aria-hidden="true"
                        >
                          <MaterialIcon name={status.icon} className="text-[18px]" />
                        </div>
                        <span
                          className={`truncate font-semibold ${
                            ready ? "text-admin-ink" : "text-admin-ink-muted"
                          }`}
                        >
                          {lesson.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-space-16 py-space-12">
                      <StatusPill label={status.label} tone={status.tone} />
                    </td>
                    <td className="px-space-16 py-space-12">
                      <div className="flex w-full max-w-[10rem] flex-col gap-1">
                        <div className="flex items-center justify-between text-admin-label-md font-semibold">
                          <span
                            className={`tabular-nums ${
                              lesson.playableClips > 0 ? "font-semibold text-admin-ink" : "text-admin-ink-subtle"
                            }`}
                          >
                            {formatCount(lesson.playableClips)}
                            <span className="font-normal text-admin-ink-subtle">
                              {" "}
                              / {formatCount(lesson.listedClips)}
                            </span>
                          </span>
                          <span className="tabular-nums text-admin-ink-subtle">
                            {formatPercent(share(lesson.playableClips, lesson.listedClips))}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-admin-subtle">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: formatPercent(share(lesson.playableClips, topClips)),
                              backgroundColor: ready ? CLIPS : ADMIN_COLORS.grid,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-space-16 py-space-12 text-center">
                      <CountPill value={lesson.missingAudio} tone="alert" />
                    </td>
                    <td className="px-space-16 py-space-12 text-center">
                      <span className="inline-flex items-center gap-space-4">
                        <CountPill value={lesson.videos} />
                        {lesson.brokenVideos > 0 ? (
                          <Badge tone="crimson">
                            <MaterialIcon name="link_off" className="-mx-0.5 text-[14px]" />
                            {formatCount(lesson.brokenVideos)}
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TablePanel>
  );
}

function initialOf(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toLocaleUpperCase() : "?";
}

export function AdminCatalog({ board }: { board: AdminCatalogBoard }) {
  const defaultSlug =
    board.levels.find((level) => level.readyLessons > 0)?.slug ??
    board.levels[0]?.slug ??
    "";
  const [selected, setSelected] = useState(defaultSlug);
  const [trackPage, setTrackPage] = useState(1);
  const active = useMemo(() => {
    return board.levels.find((level) => level.slug === selected) ?? board.levels[0] ?? null;
  }, [board.levels, selected]);

  const levelBars = useMemo(
    () => ({
      lessons: board.levels.map((level) => ({
        key: level.slug,
        label: level.label,
        value: level.readyLessons,
      })),
      clips: board.levels.map((level) => ({
        key: level.slug,
        label: level.label,
        value: level.playableClips,
      })),
      videos: board.levels.map((level) => ({
        key: level.slug,
        label: level.label,
        value: level.videos,
      })),
    }),
    [board.levels],
  );
  const trackBars = useMemo(
    () =>
      board.tracks.map((track) => ({
        key: track.slug,
        label: track.shortLabel,
        value: track.sharedPlayable + track.ownPlayable,
      })),
    [board.tracks],
  );
  const lessonsWithVideo = useMemo(
    () =>
      board.levels.reduce(
        (sum, level) => sum + level.lessons.filter((lesson) => lesson.videos > 0).length,
        0,
      ),
    [board.levels],
  );
  const emptyLessons = board.lessonsListed - board.lessonsReady;
  const ownClips = board.tracks.reduce((sum, track) => sum + track.ownPlayable, 0);
  const clipsListed = board.clipsPlayable + board.clipsMissingAudio;
  const videosListed = board.videosPlayable + board.videosBroken;
  const tracksPaged = paginate(board.tracks, trackPage, CATALOG_PAGE_SIZE);
  const levelOptions = board.levels.map((level) => ({
    key: level.slug,
    label: level.label,
    count: `${formatCount(level.readyLessons)}/${formatCount(level.listedLessons)}`,
  }));

  return (
    <main className="flex w-full flex-1 flex-col gap-space-24 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Learning"
        title="Catalog"
        subtitle="What is published on disk. Practice clip difficulty and Videos go clip-by-clip and video-by-video."
        trailing={
          <HeaderChip icon="folder_open">Read from disk</HeaderChip>
        }
      />

      <section aria-labelledby="catalog-glance" className="flex flex-col gap-space-12">
        <SectionHeading
          id="catalog-glance"
          icon="grid_view"
          title="At a glance"
          meta={`${formatCount(board.levelsListed)} CEFR levels · ${formatCount(board.tracksListed)} professions`}
        />
        <div className="grid grid-cols-1 gap-space-16 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-space-20">
          <CategoryCard
            icon="layers"
            title="Lessons"
            hint="Lektionen with audio learners can play"
            color={LESSONS}
            value={formatCount(board.lessonsReady)}
            unit={`of ${formatCount(board.lessonsListed)} lessons`}
            badge={`${formatPercent(share(board.lessonsReady, board.lessonsListed))} ready`}
            progress={share(board.lessonsReady, board.lessonsListed)}
            progressLabel="Share of listed lessons that are playable"
            metrics={[
              {
                icon: "stacks",
                label: "Levels live",
                value: `${formatCount(board.levelsReady)}/${formatCount(board.levelsListed)}`,
              },
              { icon: "draft", label: "Not playable", value: formatCount(emptyLessons) },
            ]}
            footerLabel="Ready lessons by level"
            footerAside={<FooterAside label={topLabel(levelBars.lessons)} color={LESSONS} />}
          >
            <MiniBars items={levelBars.lessons} color={LESSONS} />
          </CategoryCard>
          <CategoryCard
            icon="graphic_eq"
            title="Clips"
            hint="CEFR clips with an audio file"
            color={CLIPS}
            value={formatCount(board.clipsPlayable)}
            unit="playable"
            badge={
              board.clipsMissingAudio > 0
                ? `${formatCount(board.clipsMissingAudio)} silent`
                : "All voiced"
            }
            badgeTone={board.clipsMissingAudio > 0 ? "alert" : "accent"}
            progress={share(board.clipsPlayable, clipsListed)}
            progressLabel="Share of listed clips with audio"
            metrics={[
              {
                icon: "volume_off",
                label: "No audio",
                value: formatCount(board.clipsMissingAudio),
              },
              {
                icon: "functions",
                label: "Per lesson",
                value: perItem(board.clipsPlayable, board.lessonsReady),
              },
            ]}
            footerLabel="Playable clips by level"
            footerAside={<FooterAside label={topLabel(levelBars.clips)} color={CLIPS} />}
          >
            <MiniBars items={levelBars.clips} color={CLIPS} />
          </CategoryCard>
          <CategoryCard
            icon="play_circle"
            title="Videos"
            hint="YouTube links on Lektionen"
            color={VIDEOS}
            value={formatCount(board.videosPlayable)}
            unit="playable"
            badge={
              board.videosBroken > 0 ? `${formatCount(board.videosBroken)} broken` : "All links OK"
            }
            badgeTone={board.videosBroken > 0 ? "alert" : "accent"}
            progress={share(board.videosPlayable, videosListed)}
            progressLabel="Share of video links that parse"
            metrics={[
              { icon: "link_off", label: "Broken URLs", value: formatCount(board.videosBroken) },
              {
                icon: "video_library",
                label: "Lessons with video",
                value: formatCount(lessonsWithVideo),
              },
            ]}
            footerLabel="Videos by level"
            footerAside={<FooterAside label={topLabel(levelBars.videos)} color={VIDEOS} />}
          >
            <MiniBars items={levelBars.videos} color={VIDEOS} />
          </CategoryCard>
          <CategoryCard
            icon="record_voice_over"
            title="Interview"
            hint="Profession question tracks"
            color={INTERVIEW}
            value={formatCount(board.interviewClips)}
            unit="clips"
            badge={`${formatCount(board.tracksReady)}/${formatCount(board.tracksListed)} ready`}
            progress={share(board.tracksReady, board.tracksListed)}
            progressLabel="Share of professions that are ready"
            metrics={[
              {
                icon: "work",
                label: "Professions ready",
                value: `${formatCount(board.tracksReady)}/${formatCount(board.tracksListed)}`,
              },
              { icon: "person", label: "Own clips", value: formatCount(ownClips) },
            ]}
            footerLabel="Clips per profession"
            footerAside={<FooterAside label={topLabel(trackBars)} color={INTERVIEW} />}
          >
            <MiniBars items={trackBars} color={INTERVIEW} />
          </CategoryCard>
        </div>
      </section>

      {board.issues.length > 0 ? (
        <section aria-labelledby="catalog-issues" className="flex flex-col gap-space-12">
          <SectionHeading
            id="catalog-issues"
            icon="report"
            title="Needs a file"
            meta={`${formatCount(board.issues.length)} to fix · empty placeholders are in the table`}
          />
          <ul className="grid grid-cols-1 gap-space-12 md:grid-cols-2 xl:grid-cols-3">
            {board.issues.map((issue) => (
              <li
                key={issue.id}
                className={`${CARD} flex items-start gap-space-12 border-l-2 border-l-admin-crimson p-space-16`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-admin-control bg-admin-crimson-wash text-admin-crimson">
                  <MaterialIcon name="error" className="text-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-admin-body-md font-semibold text-admin-ink">
                    {issue.label}
                  </p>
                  <p className="mt-0.5 text-admin-body-sm text-admin-ink-muted">
                    {issue.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="catalog-levels" className="flex flex-col gap-space-12">
        <SectionHeading
          id="catalog-levels"
          icon="stacks"
          title="Lessons by level"
          meta="Ready / listed lessons"
        />
        {levelOptions.length > 0 ? (
          <ScopeChips
            label="Level"
            icon="layers"
            ariaLabel="CEFR levels"
            value={active?.slug ?? ""}
            options={levelOptions}
            onSelect={setSelected}
            tone="amber"
          />
        ) : null}
        {active ? <LessonTable key={active.slug} level={active} /> : null}
      </section>

      <section aria-labelledby="catalog-interview" className="flex flex-col gap-space-12">
        <SectionHeading
          id="catalog-interview"
          icon="record_voice_over"
          title="Interview tracks"
          meta={`${formatCount(board.tracksReady)} of ${formatCount(board.tracksListed)} ready`}
        />
        <TablePanel
          icon="work"
          title="Professions"
          hint="Shared questions are counted once. Own clips are that profession only."
          color={INTERVIEW}
          footer={
            board.tracks.length > 0 ? (
              <Pager
                page={tracksPaged.page}
                pageCount={tracksPaged.pageCount}
                start={tracksPaged.start}
                end={tracksPaged.end}
                total={board.tracks.length}
                noun="professions"
                onPage={setTrackPage}
              />
            ) : undefined
          }
        >
          {board.tracks.length === 0 ? (
            <p className="flex items-center gap-space-8 px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
              <MaterialIcon name="work_off" className="text-[20px] text-admin-ink-subtle" />
              No professions are listed yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <thead className={THEAD}>
                  <tr>
                    <th className={`${TH} min-w-[14rem]`}>Profession</th>
                    <th className={TH}>Status</th>
                    <th className={`${TH} text-center`}>Shared</th>
                    <th className={`${TH} text-center`}>Own</th>
                    <th className={`${TH} text-center`}>No audio</th>
                  </tr>
                </thead>
                <tbody className="text-admin-body-md text-admin-ink">
                  {tracksPaged.pageItems.map((track) => (
                    <tr key={track.slug} className={TR}>
                      <td className="px-space-16 py-space-12">
                        <div className="flex items-center gap-space-12">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-admin-control text-admin-label-md font-semibold ${
                              track.ready
                                ? "bg-admin-cobalt-wash text-admin-cobalt-ink"
                                : "bg-admin-subtle text-admin-ink-muted"
                            }`}
                            aria-hidden="true"
                          >
                            {initialOf(track.shortLabel)}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold text-admin-ink">
                              {track.shortLabel}
                            </span>
                            {track.label !== track.shortLabel ? (
                              <span className="truncate text-admin-body-sm text-admin-ink-subtle">
                                {track.label}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-space-16 py-space-12">
                        <StatusPill
                          label={track.ready ? "Ready" : "Missing"}
                          tone={track.ready ? "good" : "bad"}
                        />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <CountPill value={track.sharedPlayable} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <CountPill value={track.ownPlayable} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <CountPill value={track.missingAudio} tone="alert" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TablePanel>
      </section>
    </main>
  );
}
