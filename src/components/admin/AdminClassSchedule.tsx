"use client";

import { useMemo, useState } from "react";
import { saveAdminClassSchedule } from "@/app/admin/actions";
import { MaterialIcon } from "@/components/admin/AdminShell";
import { Badge, Button, CARD, INPUT, IconTile, ShareBar } from "@/components/admin/AdminUi";
import {
  CLASS_FORMATS,
  CLASS_FORMAT_LABEL,
  CLASS_WEEKDAYS,
  CLASS_WEEKDAY_LABEL,
  DEFAULT_SESSION_MINUTES,
  SESSION_MINUTES_MAX,
  SESSION_MINUTES_MIN,
  classProgress,
  isSessionStart,
  sessionEndTime,
  emptyClassSchedule,
  formatScheduleDay,
  isScheduleDay,
  scheduleToday,
  type ClassProgress,
  type ClassSchedule,
  type ClassScheduleFields,
} from "@/lib/class-schedule";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

export type ScheduleLevel = { slug: string; label: string; lektionen: number };

const FIELD = "flex flex-col gap-space-8";
const LABEL = "text-admin-label-sm uppercase text-admin-ink-subtle";
const TOGGLE =
  "inline-flex h-9 items-center justify-center rounded-admin-control border px-space-12 text-admin-body-sm font-semibold outline-none transition-colors focus-visible:shadow-admin-focus";
const TOGGLE_ON = "border-admin-cobalt bg-admin-cobalt-wash text-admin-cobalt-ink";
const TOGGLE_OFF =
  "border-admin-border bg-admin-card text-admin-ink-muted hover:border-admin-ink-faint hover:text-admin-ink";

function fieldsOf(schedule: ClassSchedule | null): ClassScheduleFields {
  if (!schedule) return emptyClassSchedule();
  return {
    format: schedule.format,
    weekdays: schedule.weekdays,
    levels: schedule.levels,
    skippedDates: schedule.skippedDates,
    sessionStart: schedule.sessionStart ?? null,
    sessionMinutes: schedule.sessionMinutes ?? null,
  };
}

/** "19:30–21:00 · 90 min", with the default length when none is set. */
function sessionTimeLine(fields: ClassScheduleFields): string | null {
  if (!fields.sessionStart) return null;
  const minutes = fields.sessionMinutes ?? DEFAULT_SESSION_MINUTES;
  return `${fields.sessionStart}–${sessionEndTime(fields.sessionStart, minutes)} · ${minutes} min`;
}

/** An empty length uses the default; a typed one must be in range, or saving would drop it silently. */
function minutesValid(fields: ClassScheduleFields): boolean {
  const minutes = fields.sessionMinutes;
  return minutes == null || (minutes >= SESSION_MINUTES_MIN && minutes <= SESSION_MINUTES_MAX);
}

function clockLabel(format: ClassScheduleFields["format"]): string {
  return format === "online_de" ? "German time" : "Vietnam time";
}

function weekdayList(weekdays: readonly number[]): string {
  return weekdays.map((day) => CLASS_WEEKDAY_LABEL[day - 1]).join(" · ");
}

function dayLabel(day: string, today: string): string {
  if (day === today) return `Today · ${formatScheduleDay(day)}`;
  return formatScheduleDay(day);
}

/** One line for the editor preview. */
function progressLine(progress: ClassProgress, levelLabel: (slug: string) => string, today: string) {
  switch (progress.kind) {
    case "no-levels":
      return "Add the level the class is on and its start date.";
    case "no-weekdays":
      return "Pick the class days to work out the next Lektion.";
    case "upcoming":
      return `${levelLabel(progress.level)} starts ${formatScheduleDay(progress.startsOn)}.`;
    case "finished":
      return `${levelLabel(progress.level)} finished on ${formatScheduleDay(progress.finishedOn)}.`;
    case "running":
      return `Next: Lektion ${progress.lektion} of ${levelLabel(progress.level)} · ${dayLabel(progress.nextOn, today)}`;
  }
}

function nextLevelAfter(levels: readonly ScheduleLevel[], used: readonly string[]): string | null {
  const last = used.at(-1);
  const index = last ? levels.findIndex((level) => level.slug === last) : -1;
  const after = levels.slice(index + 1).find((level) => !used.includes(level.slug));
  return after?.slug ?? levels.find((level) => !used.includes(level.slug))?.slug ?? null;
}

export function AdminClassSchedule({
  className,
  schedule,
  levels,
  now,
  canEdit,
  ready,
  onSaved,
}: {
  className: string;
  schedule: ClassSchedule | null;
  levels: readonly ScheduleLevel[];
  now: string;
  canEdit: boolean;
  ready: boolean;
  onSaved: (schedule: ClassSchedule) => void;
}) {
  const [draft, setDraft] = useState<ClassScheduleFields | null>(null);
  const [skipInput, setSkipInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = useMemo(() => fieldsOf(schedule), [schedule]);
  const shown = draft ?? saved;
  const today = scheduleToday(shown.format, new Date(now));
  const progress = useMemo(() => classProgress(shown, levels, today), [shown, levels, today]);
  const labelByLevel = useMemo(() => new Map(levels.map((level) => [level.slug, level.label])), [levels]);
  const levelLabel = (slug: string) => labelByLevel.get(slug) ?? slug;

  function startEditing(extraLevel?: string) {
    const fields = fieldsOf(schedule);
    setDraft(
      extraLevel
        ? { ...fields, levels: [...fields.levels, { level: extraLevel, startedOn: today }] }
        : fields,
    );
    setSkipInput("");
    setError(null);
  }

  function patch(update: Partial<ClassScheduleFields>) {
    setDraft((current) => (current ? { ...current, ...update } : current));
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveAdminClassSchedule(className, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.schedule);
      setDraft(null);
    } catch {
      setError("Could not save the class schedule.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-16 py-space-12 text-admin-body-sm text-admin-crimson-ink">
        Class schedules could not be read. Run `supabase/class_schedules.sql` once.
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between gap-space-12">
      <div className="flex items-center gap-space-8">
        <IconTile icon="calendar_month" color={ADMIN_COLORS.emerald} />
        <h3 className="text-admin-label-sm uppercase text-admin-ink-subtle">Schedule</h3>
      </div>
      {canEdit && !draft && schedule ? (
        <Button icon="edit" onClick={() => startEditing()}>
          Edit
        </Button>
      ) : null}
    </div>
  );

  if (draft) {
    return (
      <section aria-label="Edit class schedule" className={`${CARD} flex flex-col gap-space-20 p-space-16 sm:p-space-20`}>
        {header}
        <ScheduleEditor
          draft={draft}
          levels={levels}
          today={today}
          skipInput={skipInput}
          onSkipInput={setSkipInput}
          onPatch={patch}
        />

        <p className="rounded-admin-control bg-admin-emerald-wash px-space-12 py-space-8 text-admin-body-sm text-admin-emerald-ink">
          <MaterialIcon name="visibility" className="mr-space-4 align-[-3px] text-[16px]" />
          {progressLine(progress, levelLabel, today)}
        </p>

        {error ? (
          <p className="rounded-admin-control border border-admin-crimson-border bg-admin-crimson-wash px-space-12 py-space-8 text-admin-body-sm text-admin-crimson">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-space-8">
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            onClick={() => void save()}
            disabled={saving || draft.levels.some((entry) => !isScheduleDay(entry.startedOn)) || !minutesValid(draft)}
          >
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </section>
    );
  }

  if (!schedule) {
    return (
      <section aria-label="Class schedule" className={`${CARD} flex flex-col gap-space-12 p-space-16 sm:p-space-20`}>
        {header}
        <div className="flex flex-wrap items-center justify-between gap-space-12">
          <p className="text-admin-body-md text-admin-ink-subtle">
            {canEdit
              ? "Add where and when this class meets and which level it is on to see the next Lektion."
              : "No schedule yet. An owner or staff member can add it."}
          </p>
          {canEdit ? (
            <Button variant="primary" icon="add" onClick={() => startEditing()}>
              Add schedule
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const upcomingSkips = saved.skippedDates.filter((day) => day >= today);
  const pastSkips = saved.skippedDates.length - upcomingSkips.length;
  const currentLevel = progress.kind === "running" || progress.kind === "finished" || progress.kind === "no-weekdays"
    ? progress.level
    : null;

  return (
    <section aria-label="Class schedule" className={`${CARD} flex flex-col gap-space-16 p-space-16 sm:p-space-20`}>
      {header}
      <div className="grid gap-space-20 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ProgressSummary
          progress={progress}
          today={today}
          levelLabel={levelLabel}
          onStartNext={canEdit ? (level) => startEditing(level) : undefined}
        />

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-16 gap-y-space-8 text-admin-body-sm">
          <dt className={LABEL}>Where</dt>
          <dd className="text-admin-ink">
            {saved.format ? CLASS_FORMAT_LABEL[saved.format] : <span className="text-admin-ink-faint">Not set</span>}
          </dd>
          <dt className={LABEL}>Days</dt>
          <dd className="text-admin-ink">
            {saved.weekdays.length > 0 ? weekdayList(saved.weekdays) : <span className="text-admin-ink-faint">Not set</span>}
          </dd>
          <dt className={LABEL}>Time</dt>
          <dd className="text-admin-ink">
            {sessionTimeLine(saved) ? (
              <>
                {sessionTimeLine(saved)}{" "}
                <span className="text-admin-ink-subtle">({clockLabel(saved.format)})</span>
              </>
            ) : (
              <span className="text-admin-ink-faint">Not set · rating opens at 23:59</span>
            )}
          </dd>
          <dt className={LABEL}>Levels</dt>
          <dd>
            {saved.levels.length > 0 ? (
              <ul className="flex flex-col gap-space-4">
                {saved.levels.map((entry) => (
                  <li key={entry.level} className="flex flex-wrap items-center gap-space-8">
                    <Badge tone={entry.level === currentLevel ? "emerald" : "neutral"}>{levelLabel(entry.level)}</Badge>
                    <span className={entry.level === currentLevel ? "text-admin-ink" : "text-admin-ink-subtle"}>
                      {entry.startedOn > today ? "starts" : "since"} {formatScheduleDay(entry.startedOn)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-admin-ink-faint">Not set</span>
            )}
          </dd>
          <dt className={LABEL}>No class</dt>
          <dd className="text-admin-ink">
            {saved.skippedDates.length === 0 ? (
              <span className="text-admin-ink-faint">None</span>
            ) : (
              <span className="flex flex-wrap items-center gap-space-4">
                {upcomingSkips.slice(0, 4).map((day) => (
                  <Badge key={day}>{formatScheduleDay(day)}</Badge>
                ))}
                {upcomingSkips.length > 4 ? (
                  <span className="text-admin-ink-subtle">+{upcomingSkips.length - 4} more</span>
                ) : null}
                {pastSkips > 0 ? (
                  <span className="text-admin-ink-subtle">
                    {upcomingSkips.length > 0 ? "· " : ""}
                    {pastSkips} past
                  </span>
                ) : null}
              </span>
            )}
          </dd>
        </dl>
      </div>
    </section>
  );
}

function ProgressSummary({
  progress,
  today,
  levelLabel,
  onStartNext,
}: {
  progress: ClassProgress;
  today: string;
  levelLabel: (slug: string) => string;
  onStartNext?: (level: string) => void;
}) {
  if (progress.kind === "running") {
    const done = progress.lektion - 1;
    return (
      <div className="flex flex-col gap-space-8">
        <p className={LABEL}>{progress.nextOn === today ? "Today's lesson" : "Next lesson"}</p>
        <div className="flex flex-wrap items-baseline gap-space-12">
          <p className="font-admin-display text-admin-metric tabular-nums text-admin-ink">
            Lektion {progress.lektion}
          </p>
          <Badge tone="emerald">{levelLabel(progress.level)}</Badge>
        </div>
        <p className="text-admin-body-md text-admin-ink">{dayLabel(progress.nextOn, today)}</p>
        <ShareBar
          share={done / progress.total}
          color={ADMIN_COLORS.emerald}
          label={`${done} of ${progress.total} Lektionen done`}
        />
        <p className="text-admin-body-sm text-admin-ink-subtle">
          {done} of {progress.total} done · Lektion {progress.total} on {formatScheduleDay(progress.endsOn)}
        </p>
      </div>
    );
  }

  if (progress.kind === "finished") {
    const { nextLevel } = progress;
    return (
      <div className="flex flex-col gap-space-8">
        <p className={LABEL}>Level finished</p>
        <p className="font-admin-display text-admin-metric text-admin-ink">{levelLabel(progress.level)} done</p>
        <p className="text-admin-body-sm text-admin-ink-subtle">
          Lektion {progress.total} was on {formatScheduleDay(progress.finishedOn)}.
          {nextLevel ? ` Add the start date of ${levelLabel(nextLevel)}.` : ""}
        </p>
        {nextLevel && onStartNext ? (
          <div>
            <Button icon="add" onClick={() => onStartNext(nextLevel)}>
              Start {levelLabel(nextLevel)}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (progress.kind === "upcoming") {
    return (
      <div className="flex flex-col gap-space-8">
        <p className={LABEL}>Starts soon</p>
        <p className="font-admin-display text-admin-metric text-admin-ink">{levelLabel(progress.level)}</p>
        <p className="text-admin-body-md text-admin-ink">Lektion 1 · {formatScheduleDay(progress.startsOn)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-8">
      <p className={LABEL}>Next lesson</p>
      <p className="text-admin-body-md text-admin-ink-subtle">
        {progress.kind === "no-levels"
          ? "Add the level the class is on and its start date."
          : "Pick the class days to work out the next Lektion."}
      </p>
    </div>
  );
}

function ScheduleEditor({
  draft,
  levels,
  today,
  skipInput,
  onSkipInput,
  onPatch,
}: {
  draft: ClassScheduleFields;
  levels: readonly ScheduleLevel[];
  today: string;
  skipInput: string;
  onSkipInput: (value: string) => void;
  onPatch: (update: Partial<ClassScheduleFields>) => void;
}) {
  const usedLevels = draft.levels.map((entry) => entry.level);
  const nextLevel = nextLevelAfter(levels, usedLevels);

  function toggleWeekday(day: number) {
    const weekdays = draft.weekdays.includes(day)
      ? draft.weekdays.filter((item) => item !== day)
      : [...draft.weekdays, day].sort((a, b) => a - b);
    onPatch({ weekdays });
  }

  function setLevel(index: number, update: Partial<ClassScheduleFields["levels"][number]>) {
    onPatch({
      levels: draft.levels.map((entry, at) => (at === index ? { ...entry, ...update } : entry)),
    });
  }

  function addSkip() {
    if (!isScheduleDay(skipInput)) return;
    if (!draft.skippedDates.includes(skipInput)) {
      onPatch({ skippedDates: [...draft.skippedDates, skipInput].sort() });
    }
    onSkipInput("");
  }

  return (
    <div className="grid gap-space-20 lg:grid-cols-2">
      <div className="flex flex-col gap-space-20">
        <fieldset className={FIELD}>
          <legend className={`${LABEL} mb-space-8`}>Where</legend>
          <div className="grid grid-cols-2 gap-space-8">
            {CLASS_FORMATS.map((format) => {
              const on = draft.format === format;
              return (
                <button
                  key={format}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPatch({ format: on ? null : format })}
                  className={`${TOGGLE} ${on ? TOGGLE_ON : TOGGLE_OFF}`}
                >
                  {CLASS_FORMAT_LABEL[format]}
                </button>
              );
            })}
          </div>
          {draft.format === "online_de" ? (
            <p className="text-admin-body-sm text-admin-ink-subtle">Days follow German time.</p>
          ) : null}
        </fieldset>

        <fieldset className={FIELD}>
          <legend className={`${LABEL} mb-space-8`}>Class days</legend>
          <div className="grid grid-cols-7 gap-space-4">
            {CLASS_WEEKDAYS.map((day) => {
              const on = draft.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleWeekday(day)}
                  className={`${TOGGLE} px-0 ${on ? TOGGLE_ON : TOGGLE_OFF}`}
                >
                  {CLASS_WEEKDAY_LABEL[day - 1]}
                </button>
              );
            })}
          </div>
          <p className="text-admin-body-sm text-admin-ink-subtle">Each class day is one Lektion.</p>
        </fieldset>

        <fieldset className={FIELD}>
          <legend className={`${LABEL} mb-space-8`}>Class time</legend>
          <div className="grid grid-cols-2 gap-space-8">
            <label className="flex flex-col gap-space-4 text-admin-body-sm text-admin-ink-subtle">
              Starts
              <input
                type="time"
                step={300}
                className={INPUT}
                value={draft.sessionStart ?? ""}
                onChange={(event) => {
                  const value = event.target.value.slice(0, 5);
                  onPatch({
                    sessionStart: isSessionStart(value) ? value : null,
                    sessionMinutes: isSessionStart(value) ? draft.sessionMinutes : null,
                  });
                }}
              />
            </label>
            <label className="flex flex-col gap-space-4 text-admin-body-sm text-admin-ink-subtle">
              Minutes
              <input
                type="number"
                inputMode="numeric"
                min={SESSION_MINUTES_MIN}
                max={SESSION_MINUTES_MAX}
                step={5}
                placeholder={String(DEFAULT_SESSION_MINUTES)}
                disabled={!draft.sessionStart}
                className={INPUT}
                value={draft.sessionMinutes ?? ""}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  onPatch({ sessionMinutes: Number.isFinite(value) ? Math.round(value) : null });
                }}
              />
            </label>
          </div>
          <p className="text-admin-body-sm text-admin-ink-subtle">
            {draft.sessionStart
              ? `${sessionTimeLine(draft)} in ${clockLabel(draft.format)}. Students can rate the session from its end for 48 hours.`
              : "Without a start time, students can rate a session from 23:59 that day."}
          </p>
        </fieldset>
      </div>

      <div className="flex flex-col gap-space-20">
        <fieldset className={FIELD}>
          <legend className={`${LABEL} mb-space-8`}>Levels and start dates</legend>
          {draft.levels.length === 0 ? (
            <p className="text-admin-body-sm text-admin-ink-subtle">No level yet.</p>
          ) : (
            <ul className="flex flex-col gap-space-8">
              {draft.levels.map((entry, index) => (
                <li key={index} className="flex items-center gap-space-8">
                  <div className="w-28 shrink-0">
                    <select
                      aria-label="Level"
                      className={INPUT}
                      value={entry.level}
                      onChange={(event) => setLevel(index, { level: event.target.value })}
                    >
                      {levels.map((level) => (
                        <option
                          key={level.slug}
                          value={level.slug}
                          disabled={level.slug !== entry.level && usedLevels.includes(level.slug)}
                        >
                          {level.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      type="date"
                      aria-label={`Start date of ${levels.find((level) => level.slug === entry.level)?.label ?? entry.level}`}
                      className={INPUT}
                      value={entry.startedOn}
                      onChange={(event) => setLevel(index, { startedOn: event.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remove level"
                    onClick={() => onPatch({ levels: draft.levels.filter((_, at) => at !== index) })}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-admin-control text-admin-ink-faint outline-none transition-colors hover:bg-admin-subtle hover:text-admin-crimson focus-visible:shadow-admin-focus"
                  >
                    <MaterialIcon name="delete" className="text-[18px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextLevel ? (
            <div>
              <Button
                icon="add"
                onClick={() => onPatch({ levels: [...draft.levels, { level: nextLevel, startedOn: today }] })}
              >
                Add level
              </Button>
            </div>
          ) : null}
          <p className="text-admin-body-sm text-admin-ink-subtle">
            The level that started most recently sets the next Lektion. Lektion 1 is the first class day on or after
            its date.
          </p>
        </fieldset>

        <fieldset className={FIELD}>
          <legend className={`${LABEL} mb-space-8`}>No class on</legend>
          <div className="flex items-center gap-space-8">
            <input
              type="date"
              aria-label="Day without class"
              className={`${INPUT} min-w-0 flex-1`}
              value={skipInput}
              onChange={(event) => onSkipInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addSkip();
                }
              }}
            />
            <Button icon="add" onClick={addSkip} disabled={!isScheduleDay(skipInput)}>
              Add
            </Button>
          </div>
          {draft.skippedDates.length > 0 ? (
            <ul className="flex flex-wrap gap-space-4">
              {draft.skippedDates.map((day) => (
                <li key={day}>
                  <button
                    type="button"
                    aria-label={`Remove ${formatScheduleDay(day)}`}
                    onClick={() => onPatch({ skippedDates: draft.skippedDates.filter((item) => item !== day) })}
                    className="inline-flex h-7 items-center gap-space-4 rounded-admin-badge bg-admin-subtle px-space-8 text-admin-body-sm text-admin-ink outline-none ring-1 ring-inset ring-admin-hairline transition-colors hover:text-admin-crimson focus-visible:shadow-admin-focus"
                  >
                    {formatScheduleDay(day)}
                    <MaterialIcon name="close" className="text-[14px]" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-admin-body-sm text-admin-ink-subtle">Holidays and cancelled lessons don&apos;t count.</p>
          )}
        </fieldset>
      </div>
    </div>
  );
}
