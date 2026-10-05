"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { LessonPathIcon } from "@/app/learn/[levelSlug]/LevelViewClient";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  buildLevelPath,
  projectStudentDetail,
  type AdminCatalogCourse,
  type AdminLevelPathLesson,
  type AdminLevelPathNode,
  type AdminLevelPathPerson,
} from "@/lib/admin-detail";
import {
  classKey,
  listAdminClasses,
  type AdminLevelOption,
  type AdminUserRow,
} from "@/lib/admin-overview";

/** The zig-zag of the learner level overview, so the trail reads the same. */
const PATH_SHIFT = [
  "-translate-x-9",
  "translate-x-9",
  "translate-x-0",
  "-translate-x-6",
  "translate-x-8",
] as const;

const STACK_LIMIT = 3;

function PersonAvatar({ person }: { person: AdminLevelPathPerson }) {
  const [failed, setFailed] = useState(false);

  if (person.image && !failed) {
    return (
      <span className="block h-8 w-8 overflow-hidden rounded-full bg-surface-container">
        <Image
          src={person.image}
          alt=""
          width={32}
          height={32}
          referrerPolicy="no-referrer"
          className="h-8 w-8 object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-label-sm text-[13px] font-bold uppercase text-on-primary">
      {Array.from(person.displayName)[0]?.toLocaleUpperCase("vi") ?? "?"}
    </span>
  );
}

function StudentStack({
  people,
  onOpen,
  limit = STACK_LIMIT,
  className = "max-w-[7.5rem]",
}: {
  people: readonly AdminLevelPathPerson[];
  onOpen: (userId: string) => void;
  limit?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;

  const shown = expanded ? people : people.slice(0, limit);
  const hidden = people.length - shown.length;

  return (
    <span className={`flex flex-wrap items-center gap-y-1 ${className}`}>
      {shown.map((person) => (
        <button
          key={person.userId}
          type="button"
          onClick={() => onOpen(person.userId)}
          title={person.displayName}
          aria-label={`Open ${person.displayName}`}
          className="-ml-2 rounded-full ring-2 ring-white transition-transform first:ml-0 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <PersonAvatar person={person} />
        </button>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`Show ${hidden} more ${hidden === 1 ? "student" : "students"}`}
          className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high font-label-sm text-[11px] font-bold tabular-nums text-on-surface ring-2 ring-white"
        >
          +{hidden}
        </button>
      ) : null}
    </span>
  );
}

function NodeCircle({ icon }: { icon: string }) {
  return (
    <span className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white bg-white shadow-[0_6px_0_0_#bec8d2]">
      <LessonPathIcon name={icon} onWhite className="h-10 w-10" />
    </span>
  );
}

function formatLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function nodeStat(
  node: AdminLevelPathNode,
  lengthSeconds: number | null,
): { label: string; value: string } | null {
  if (node.kind === "video") {
    return lengthSeconds == null
      ? null
      : { label: "Length", value: formatLength(lengthSeconds) };
  }
  if (node.count == null) return null;
  if (node.kind === "study") {
    return { label: node.count === 1 ? "Clip" : "Clips", value: String(node.count) };
  }
  return { label: node.count === 1 ? "Card" : "Cards", value: String(node.count) };
}

function PathNode({
  node,
  lengthSeconds,
  open,
  onToggle,
  onClose,
  onOpen,
}: {
  node: AdminLevelPathNode;
  lengthSeconds: number | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (userId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const names = node.here.map((person) => person.displayName).join(", ");
  const stat = nodeStat(node, lengthSeconds);
  const detailLabel = stat ? `${node.label}, ${stat.value} ${stat.label.toLowerCase()}` : node.label;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="relative flex w-[10.5rem] flex-col items-center text-center">
      <span className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-label={detailLabel}
          onClick={onToggle}
          className="rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <NodeCircle icon={node.icon} />
        </button>
        {node.here.length > 0 ? (
          <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
            <StudentStack people={node.here} onOpen={onOpen} />
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 line-clamp-2 font-label-sm text-[12px] font-bold leading-4 text-on-surface">
        {node.label}
      </span>
      {node.here.length > 0 ? (
        <span className="sr-only">Working here: {names}</span>
      ) : null}
      {open ? (
        <div
          role="dialog"
          aria-label={node.label}
          className="mt-2 w-[13.5rem] rounded-2xl border border-outline-variant/20 bg-surface-container-lowest px-space-12 py-space-12 text-left shadow-[0_8px_24px_rgba(25,28,30,0.12)]"
        >
          <p className="font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {node.kind === "video" ? "Video" : node.kind === "study" ? "Study" : "Practice"}
          </p>
          <p className="mt-1 font-label-sm text-[13px] font-bold leading-4 text-on-surface">
            {node.label}
          </p>
          {stat ? (
            <p className="mt-space-8 font-headline-sm text-headline-sm tabular-nums text-on-surface">
              {stat.value}
              <span className="ml-1 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                {stat.label.toLowerCase()}
              </span>
            </p>
          ) : (
            <p className="mt-space-8 font-body-sm text-body-sm text-on-surface-variant">
              Length is not in the data loaded on this page.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LessonTrail({
  levelLabel,
  lesson,
  lengths,
  selectedId,
  onToggle,
  onClose,
  onOpen,
}: {
  levelLabel: string;
  lesson: AdminLevelPathLesson;
  lengths: ReadonlyMap<string, number>;
  selectedId: string | null;
  onToggle: (nodeId: string) => void;
  onClose: () => void;
  onOpen: (userId: string) => void;
}) {
  const empty = lesson.nodes.length === 0;
  const raised = lesson.nodes.some((node) => selectedId === `${lesson.id}:${node.id}`);

  return (
    <li className={`flex flex-col items-center ${raised ? "relative z-20" : ""}`}>
      <div
        className={`w-full rounded-2xl p-space-16 ${
          empty
            ? "bg-surface-container-low"
            : "bg-surface-container-lowest shadow-[0_4px_0_0_#dae2fd]"
        }`}
      >
        <div className="flex items-center justify-between gap-space-12">
          <h3
            className={`min-w-0 font-headline-sm text-headline-sm font-semibold tracking-tight ${
              empty ? "text-on-surface-variant" : "text-on-surface"
            }`}
          >
            {levelLabel} - {lesson.label}
          </h3>
          {empty ? (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-container px-2.5 py-1 font-caption text-caption font-semibold uppercase tracking-wider text-on-surface-variant">
              Coming soon
            </span>
          ) : null}
        </div>
      </div>
      {empty ? null : (
        <ul className="flex w-full flex-col items-center gap-space-12 py-space-12">
          {lesson.nodes.map((node, index) => (
            <li
              key={node.id}
              className={`relative ${PATH_SHIFT[index % PATH_SHIFT.length]} ${
                selectedId === `${lesson.id}:${node.id}` ? "z-20" : ""
              }`}
            >
              <PathNode
                node={node}
                lengthSeconds={node.videoKey ? (lengths.get(node.videoKey) ?? null) : null}
                open={selectedId === `${lesson.id}:${node.id}`}
                onToggle={() => onToggle(`${lesson.id}:${node.id}`)}
                onClose={onClose}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function FilterChips<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: readonly { key: T; label: string; count?: number }[];
  value: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-space-8">
      {options.map((option) => {
        const on = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(option.key)}
            className={`inline-flex h-9 items-center gap-space-4 rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
              on
                ? "bg-primary text-on-primary"
                : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
            }`}
          >
            {option.label}
            {option.count == null ? null : (
              <span className={`tabular-nums ${on ? "text-on-primary/70" : "text-outline"}`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
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

export function AdminLevels({
  rows,
  levels,
  courseCatalog,
  storeConfigured,
}: {
  rows: readonly AdminUserRow[];
  levels: readonly AdminLevelOption[];
  courseCatalog: readonly AdminCatalogCourse[];
  storeConfigured: boolean;
}) {
  const [levelSlug, setLevelSlug] = useState(levels[0]?.slug ?? "");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Admin accounts open every level regardless of grants, so they are teachers
  // here rather than students on the trail.
  const students = useMemo(() => rows.filter((row) => !row.isAdmin), [rows]);
  const details = useMemo(
    () =>
      students.map((row) => ({
        row,
        detail: projectStudentDetail(courseCatalog, row.progress),
      })),
    [students, courseCatalog],
  );
  const classOptions = useMemo(() => listAdminClasses(students), [students]);
  const unassignedCount = useMemo(
    () => students.filter((row) => !classKey(row.className)).length,
    [students],
  );

  const members = useMemo(
    () =>
      details
        .filter(({ row }) => row.levelAccess.includes(levelSlug))
        .filter(
          ({ row }) => classFilter === "all" || classKey(row.className) === classFilter,
        )
        .map(({ row, detail }) => ({
          userId: row.userId,
          displayName: row.displayName,
          image: row.image,
          className: row.className,
          course: detail.courses.find((course) => course.id === levelSlug),
        })),
    [details, levelSlug, classFilter],
  );

  const path = useMemo(
    () => buildLevelPath(courseCatalog, levelSlug, members),
    [courseCatalog, levelSlug, members],
  );

  const openStudent = useCallback((userId: string) => setDetailUserId(userId), []);
  const closeNode = useCallback(() => setSelectedNodeId(null), []);
  const toggleNode = useCallback((nodeId: string) => {
    setSelectedNodeId((current) => (current === nodeId ? null : nodeId));
  }, []);
  const lengths = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      for (const visit of row.progress.visits ?? []) {
        for (const video of visit.videos) {
          const seconds = video.durationSeconds ?? 0;
          if (seconds <= 0) continue;
          const current = map.get(video.key) ?? 0;
          if (seconds > current) map.set(video.key, seconds);
        }
      }
    }
    return map;
  }, [rows]);
  const detailRow = students.find((row) => row.userId === detailUserId) ?? null;
  const grantedCount = members.length;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Learning"
        title="Levels"
        subtitle="The learner level overview, one level at a time. Each student sits on the latest node they have started."
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured, so no student can be placed on a path.
        </div>
      ) : null}

      <section className="flex flex-col gap-space-12">
        <FilterChips
          label="Level"
          value={levelSlug}
          onSelect={(slug) => {
            setLevelSlug(slug);
            setSelectedNodeId(null);
          }}
          options={levels.map((level) => ({ key: level.slug, label: level.level }))}
        />
        {classOptions.length > 0 || unassignedCount > 0 ? (
          <FilterChips
            label="Class"
            value={classFilter}
            onSelect={(key) => {
              setClassFilter(key);
              setSelectedNodeId(null);
            }}
            options={[
              { key: "all", label: "All classes", count: students.length },
              ...classOptions.map((option) => ({
                key: option.key,
                label: option.label,
                count: option.count,
              })),
              ...(unassignedCount > 0
                ? [{ key: "", label: "Unassigned", count: unassignedCount }]
                : []),
            ]}
          />
        ) : null}
      </section>

      {path == null ? (
        <p className="font-body-md text-body-md text-on-surface-variant">
          This level is not in the catalog.
        </p>
      ) : (
        <>
          <section
            aria-label="Level totals"
            className="grid grid-cols-2 gap-space-12"
          >
            <SummaryStat
              label="On the path"
              value={String(path.studentCount)}
              icon="group"
              hint={`Of ${grantedCount} granted ${path.label}`}
            />
            <SummaryStat
              label="Lektionen"
              value={String(path.lessons.length)}
              icon="library_books"
              hint={`${path.lessons.reduce((sum, lesson) => sum + lesson.nodes.length, 0)} nodes on the path`}
            />
          </section>

          <section aria-label={`${path.label} path`} className="flex flex-col gap-space-16">
            {path.studentCount === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {grantedCount === 0
                  ? `Nobody has access to ${path.label} yet. Grant it on the Access page.`
                  : `Nobody has opened ${path.label} yet, so the path has no avatars.`}
              </p>
            ) : null}

            <ol className="mx-auto flex w-full max-w-lg flex-col gap-space-24">
              {path.lessons.map((lesson) => (
                <LessonTrail
                  key={lesson.id}
                  levelLabel={path.label}
                  lesson={lesson}
                  lengths={lengths}
                  selectedId={selectedNodeId}
                  onToggle={toggleNode}
                  onClose={closeNode}
                  onOpen={openStudent}
                />
              ))}
            </ol>

            {path.finished.length > 0 ? (
              <div className="mx-auto flex w-full max-w-lg flex-col gap-space-12 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-space-16 shadow-sm">
                <div className="flex items-center gap-space-8">
                  <MaterialIcon name="flag_circle" className="text-[22px] text-primary" filled />
                  <p className="font-label-md text-label-md font-semibold text-on-surface">
                    Finished {path.label}
                  </p>
                </div>
                <StudentStack
                  people={path.finished}
                  onOpen={openStudent}
                  limit={10}
                  className="w-full"
                />
              </div>
            ) : null}
          </section>
        </>
      )}

      {detailRow ? (
        <StudentDetail
          row={detailRow}
          catalog={courseCatalog}
          onClose={() => setDetailUserId(null)}
        />
      ) : null}
    </main>
  );
}
