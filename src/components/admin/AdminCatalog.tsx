"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  type AdminCatalogBoard,
  type AdminCatalogLessonStatus,
  type AdminCatalogLevelRow,
} from "@/lib/admin-catalog";

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

function statusLabel(status: AdminCatalogLessonStatus): string {
  if (status === "ready") return "Ready";
  if (status === "silent") return "No audio";
  if (status === "stub") return "Empty";
  return "Not on disk";
}

function StatusChip({ status }: { status: AdminCatalogLessonStatus }) {
  const ready = status === "ready";
  return (
    <span
      className={`inline-flex items-center rounded-full px-space-12 py-1 font-label-sm text-label-sm font-semibold ${
        ready
          ? "bg-primary-fixed text-on-primary-fixed"
          : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

function LessonTable({ level }: { level: AdminCatalogLevelRow }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">
          {level.label} lessons
        </h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
          {formatCount(level.readyLessons)} of {formatCount(level.listedLessons)}{" "}
          playable. Clips count files learners can hear.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Lesson</th>
              <th className="px-space-12 py-space-8">Status</th>
              <th className="px-space-12 py-space-8 text-right">Playable</th>
              <th className="px-space-12 py-space-8 text-right">Listed</th>
              <th className="px-space-12 py-space-8 text-right">No audio</th>
              <th className="px-space-16 py-space-8 text-right">Videos</th>
            </tr>
          </thead>
          <tbody>
            {level.lessons.map((lesson) => (
              <tr
                key={lesson.id}
                className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
              >
                <td className="px-space-16 py-space-8 font-medium">{lesson.label}</td>
                <td className="px-space-12 py-space-8">
                  <StatusChip status={lesson.status} />
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(lesson.playableClips)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums text-on-surface-variant">
                  {formatCount(lesson.listedClips)}
                </td>
                <td
                  className={`px-space-12 py-space-8 text-right tabular-nums ${
                    lesson.missingAudio > 0 ? "font-medium text-on-surface" : "text-outline"
                  }`}
                >
                  {formatCount(lesson.missingAudio)}
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums">
                  {formatCount(lesson.videos)}
                  {lesson.brokenVideos > 0 ? (
                    <span className="ml-space-8 text-on-surface-variant">
                      ({formatCount(lesson.brokenVideos)} broken)
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminCatalog({ board }: { board: AdminCatalogBoard }) {
  const defaultSlug =
    board.levels.find((level) => level.readyLessons > 0)?.slug ??
    board.levels[0]?.slug ??
    "";
  const [selected, setSelected] = useState(defaultSlug);
  const active = useMemo(() => {
    return board.levels.find((level) => level.slug === selected) ?? board.levels[0] ?? null;
  }, [board.levels, selected]);

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Learning"
        title="Catalog"
        subtitle="What is published on disk. Practice clip difficulty and Videos go clip-by-clip and video-by-video."
      />

      <section
        aria-label="Catalog totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Levels"
          value={`${formatCount(board.levelsReady)}/${formatCount(board.levelsListed)}`}
          icon="layers"
          hint="CEFR levels with at least one playable lesson"
        />
        <SummaryStat
          label="Lessons"
          value={`${formatCount(board.lessonsReady)}/${formatCount(board.lessonsListed)}`}
          icon="menu_book"
          hint="Lektionen with audio learners can play"
        />
        <SummaryStat
          label="Clips"
          value={formatCount(board.clipsPlayable)}
          icon="graphic_eq"
          hint={
            board.clipsMissingAudio > 0
              ? `${formatCount(board.clipsMissingAudio)} listed without audio`
              : "Every listed CEFR clip has audio"
          }
        />
        <SummaryStat
          label="Videos"
          value={formatCount(board.videosPlayable)}
          icon="smart_display"
          hint={
            board.videosBroken > 0
              ? `${formatCount(board.videosBroken)} URL${board.videosBroken === 1 ? "" : "s"} could not be parsed`
              : "YouTube links on Lektionen"
          }
        />
        <SummaryStat
          label="Interview"
          value={formatCount(board.interviewClips)}
          icon="record_voice_over"
          hint={`${formatCount(board.tracksReady)} of ${formatCount(board.tracksListed)} professions ready`}
        />
      </section>

      {board.issues.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-error-container bg-error-container/30 shadow-sm">
          <div className="px-space-16 py-space-12">
            <h2 className="font-label-md text-label-md font-semibold text-on-error-container">
              Needs a file
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-error-container/80">
              Empty placeholder lesson files are listed in the table, not here.
            </p>
          </div>
          <ul className="flex flex-col border-t border-error-container/40">
            {board.issues.map((issue) => (
              <li
                key={issue.id}
                className="flex flex-col gap-0.5 border-t border-error-container/25 px-space-16 py-space-12 first:border-t-0"
              >
                <p className="font-label-md text-label-md font-semibold text-on-error-container">
                  {issue.label}
                </p>
                <p className="font-caption text-caption text-on-error-container/80">
                  {issue.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div
        role="tablist"
        aria-label="CEFR levels"
        className="flex flex-wrap gap-space-8"
      >
        {board.levels.map((level) => {
          const on = level.slug === active?.slug;
          return (
            <button
              key={level.slug}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSelected(level.slug)}
              className={`inline-flex h-9 items-center gap-space-8 rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                on
                  ? "bg-primary text-on-primary"
                  : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
              }`}
            >
              {level.label}
              <span className={`tabular-nums ${on ? "text-on-primary/80" : "text-on-surface-variant"}`}>
                {formatCount(level.readyLessons)}/{formatCount(level.listedLessons)}
              </span>
            </button>
          );
        })}
      </div>

      {active ? <LessonTable level={active} /> : null}

      <section className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="px-space-16 py-space-12">
          <h2 className="font-label-md text-label-md font-semibold text-on-surface">
            Interview tracks
          </h2>
          <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
            Shared questions are counted once. Own clips are that profession only.
          </p>
        </div>
        {board.tracks.length === 0 ? (
          <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
            No professions are listed yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <thead>
                <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  <th className="px-space-16 py-space-8">Profession</th>
                  <th className="px-space-12 py-space-8">Status</th>
                  <th className="px-space-12 py-space-8 text-right">Shared</th>
                  <th className="px-space-12 py-space-8 text-right">Own</th>
                  <th className="px-space-16 py-space-8 text-right">No audio</th>
                </tr>
              </thead>
              <tbody>
                {board.tracks.map((track) => (
                  <tr
                    key={track.slug}
                    className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
                  >
                    <td className="px-space-16 py-space-8">
                      <p className="font-medium">{track.shortLabel}</p>
                      {track.label !== track.shortLabel ? (
                        <p className="font-caption text-caption text-on-surface-variant">
                          {track.label}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-space-12 py-space-8">
                      <span
                        className={`inline-flex items-center rounded-full px-space-12 py-1 font-label-sm text-label-sm font-semibold ${
                          track.ready
                            ? "bg-primary-fixed text-on-primary-fixed"
                            : "bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        {track.ready ? "Ready" : "Missing"}
                      </span>
                    </td>
                    <td className="px-space-12 py-space-8 text-right tabular-nums">
                      {formatCount(track.sharedPlayable)}
                    </td>
                    <td className="px-space-12 py-space-8 text-right tabular-nums">
                      {formatCount(track.ownPlayable)}
                    </td>
                    <td
                      className={`px-space-16 py-space-8 text-right tabular-nums ${
                        track.missingAudio > 0 ? "font-medium" : "text-outline"
                      }`}
                    >
                      {formatCount(track.missingAudio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
