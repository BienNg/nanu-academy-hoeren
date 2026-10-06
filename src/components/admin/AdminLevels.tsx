"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { Badge, CARD, KpiTile, ScopeChips } from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
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

const STACK_LIMIT = 3;

function PersonAvatar({ person }: { person: AdminLevelPathPerson }) {
  const [failed, setFailed] = useState(false);

  if (person.image && !failed) {
    return (
      <span className="block h-8 w-8 overflow-hidden rounded-full bg-admin-subtle">
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
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-admin-cobalt text-[12px] font-semibold uppercase text-white">
      {Array.from(person.displayName)[0]?.toLocaleUpperCase("vi") ?? "?"}
    </span>
  );
}

function StudentStack({
  people,
  onOpen,
  limit = STACK_LIMIT,
  nowrap = false,
  className = "max-w-[7.5rem]",
}: {
  people: readonly AdminLevelPathPerson[];
  onOpen: (userId: string) => void;
  limit?: number;
  nowrap?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;

  const shown = expanded ? people : people.slice(0, limit);
  const hidden = people.length - shown.length;

  return (
    <span
      className={`flex items-center gap-y-1 ${nowrap ? "flex-nowrap" : "flex-wrap"} ${className}`}
    >
      {shown.map((person) => (
        <button
          key={person.userId}
          type="button"
          onClick={() => onOpen(person.userId)}
          title={person.displayName}
          aria-label={`Open ${person.displayName}`}
          className="-ml-2 rounded-full ring-2 ring-admin-card outline-none transition-transform first:ml-0 hover:-translate-y-0.5 hover:ring-admin-cobalt focus-visible:ring-admin-cobalt"
        >
          <PersonAvatar person={person} />
        </button>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`Show ${hidden} more ${hidden === 1 ? "student" : "students"}`}
          className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-admin-subtle text-[11px] font-semibold tabular-nums text-admin-ink-muted ring-2 ring-admin-card outline-none hover:bg-admin-hairline focus-visible:shadow-admin-focus"
        >
          +{hidden}
        </button>
      ) : null}
    </span>
  );
}

/** Segmented ring so a node shows how many parts it holds. One part draws no ring. */
function PartsRing({ parts }: { parts: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const count = Math.max(2, Math.round(parts));
  const slot = circumference / count;
  const gap = Math.min(10, slot * 0.18);
  const segment = slot - gap;

  return (
    <svg className="absolute inset-1 -rotate-90 text-admin-cobalt" viewBox="0 0 64 64" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <circle
          key={index}
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${segment} ${circumference - segment}`}
          strokeDashoffset={-index * (segment + gap)}
        />
      ))}
    </svg>
  );
}

function NodeCircle({ icon, parts }: { icon: string; parts: number }) {
  return (
    <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white bg-admin-card shadow-[0_6px_0_0_#bec8d2]">
      {parts > 1 ? <PartsRing parts={parts} /> : null}
      <LessonPathIcon name={icon} onWhite className="relative h-10 w-10" />
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
  const partsLabel = node.parts > 1 ? `${node.parts} parts` : null;
  const detailLabel = [node.label, partsLabel, stat ? `${stat.value} ${stat.label.toLowerCase()}` : null]
    .filter(Boolean)
    .join(", ");

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
          className="rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-admin-cobalt"
        >
          <NodeCircle icon={node.icon} parts={node.parts} />
        </button>
        {open ? (
          <div
            role="dialog"
            aria-label={node.label}
            className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-[13.5rem] -translate-x-1/2"
          >
            <div className="rounded-admin-card border border-admin-border bg-admin-card px-space-12 py-space-12 text-left shadow-admin-pop">
              <p className="text-admin-label-sm uppercase text-admin-ink-subtle">
                {node.kind === "video" ? "Video" : node.kind === "study" ? "Study" : "Practice"}
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-4 text-admin-ink">{node.label}</p>
              {partsLabel ? (
                <p className="mt-space-8 font-admin-display text-admin-headline-md tabular-nums text-admin-ink">
                  {node.parts}
                  <span className="ml-1 text-admin-label-md font-semibold text-admin-ink-muted">parts</span>
                </p>
              ) : null}
              {stat ? (
                partsLabel ? (
                  <p className="mt-1 text-admin-body-sm text-admin-ink-muted">
                    {stat.value} {stat.label.toLowerCase()}
                  </p>
                ) : (
                  <p className="mt-space-8 font-admin-display text-admin-headline-md tabular-nums text-admin-ink">
                    {stat.value}
                    <span className="ml-1 text-admin-label-md font-semibold text-admin-ink-muted">
                      {stat.label.toLowerCase()}
                    </span>
                  </p>
                )
              ) : (
                <p className="mt-space-8 text-admin-body-sm text-admin-ink-muted">
                  Length is not in the data loaded on this page.
                </p>
              )}
            </div>
            <span
              aria-hidden="true"
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-admin-border"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent border-t-white"
            />
          </div>
        ) : null}
        {node.here.length > 0 ? (
          <span className="absolute top-1/2 left-full ml-3 -translate-y-1/2">
            <StudentStack people={node.here} onOpen={onOpen} nowrap className="" />
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-4 text-admin-ink">
        {node.label}
      </span>
      {node.here.length > 0 ? (
        <span className="sr-only">Working here: {names}</span>
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
        className={`w-full rounded-admin-card border px-space-16 py-space-12 ${
          empty ? "border-dashed border-admin-border bg-admin-subtle" : "border-admin-hairline bg-admin-card shadow-admin-card"
        }`}
      >
        <div className="flex items-center justify-between gap-space-12">
          <h3
            className={`flex min-w-0 items-center gap-space-8 font-admin-display text-admin-headline-sm ${
              empty ? "text-admin-ink-muted" : "text-admin-ink"
            }`}
          >
            <Badge tone={empty ? "neutral" : "amber"}>{levelLabel}</Badge>
            <span className="truncate">{lesson.label}</span>
          </h3>
          {empty ? <Badge>Coming soon</Badge> : null}
        </div>
      </div>
      {empty ? null : (
        <ul className="flex w-full flex-col items-start gap-space-12 py-space-12">
          {lesson.nodes.map((node) => (
            <li
              key={node.id}
              className={selectedId === `${lesson.id}:${node.id}` ? "relative z-20" : "relative"}
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
  const grantedByLevel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of students) {
      for (const slug of row.levelAccess) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  }, [students]);
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
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
          Cloud progress is not configured, so no student can be placed on a path.
        </div>
      ) : null}

      <section className="flex flex-col gap-space-12">
        <ScopeChips
          label="Level"
          icon="stairs"
          ariaLabel="Level"
          tone="amber"
          value={levelSlug}
          onSelect={(slug) => {
            setLevelSlug(slug);
            setSelectedNodeId(null);
          }}
          options={levels.map((level) => ({
            key: level.slug,
            label: level.level,
            count: grantedByLevel.get(level.slug) ?? 0,
          }))}
        />
        {classOptions.length > 0 || unassignedCount > 0 ? (
          <ScopeChips
            label="Class"
            icon="school"
            ariaLabel="Class"
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
              ...(unassignedCount > 0 ? [{ key: "", label: "Unassigned", count: unassignedCount }] : []),
            ]}
          />
        ) : null}
      </section>

      {path == null ? (
        <p className="text-admin-body-md text-admin-ink-muted">
          This level is not in the catalog.
        </p>
      ) : (
        <>
          <section aria-label="Level totals" className="grid grid-cols-2 gap-space-16 lg:max-w-2xl">
            <KpiTile
              icon="group"
              label="On the path"
              value={String(path.studentCount)}
              caption={`Of ${grantedCount} granted ${path.label}`}
              color={ADMIN_COLORS.amber}
              progress={grantedCount > 0 ? path.studentCount / grantedCount : 0}
              progressLabel={`Share of students granted ${path.label} who have started it`}
            />
            <KpiTile
              icon="library_books"
              label="Lektionen"
              value={String(path.lessons.length)}
              caption={`${path.lessons.reduce((sum, lesson) => sum + lesson.nodes.length, 0)} nodes on the path`}
              color={ADMIN_COLORS.emerald}
            />
          </section>

          <section aria-label={`${path.label} path`} className="flex flex-col gap-space-16">
            {path.studentCount === 0 ? (
              <p className="text-admin-body-md text-admin-ink-muted">
                {grantedCount === 0
                  ? `Nobody has access to ${path.label} yet. Grant it on the Access page.`
                  : `Nobody has opened ${path.label} yet, so the path has no avatars.`}
              </p>
            ) : null}

            <ol className="flex w-full flex-col gap-space-24 lg:max-w-2xl">
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
              <div
                className={`${CARD} flex w-full flex-col gap-space-12 border-t-2 p-space-16 lg:max-w-2xl`}
                style={{ borderTopColor: ADMIN_COLORS.emerald }}
              >
                <div className="flex items-center gap-space-8">
                  <MaterialIcon name="flag_circle" className="text-[22px] text-admin-emerald" filled />
                  <p className="text-admin-body-md font-semibold text-admin-ink">
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
