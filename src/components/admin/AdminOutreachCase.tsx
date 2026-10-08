"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveOutreachCase } from "@/app/admin/outreach/actions";
import { MaterialIcon } from "@/components/admin/AdminShell";
import { Badge, Button, Drawer, INPUT, Segmented, type BadgeTone } from "@/components/admin/AdminUi";
import { formatAdminTimestamp } from "@/lib/admin-overview";
import { formatActiveDuration } from "@/lib/progress";
import {
  OUTREACH_ADDRESSES,
  OUTREACH_GROUPS,
  OUTREACH_GROUP_LABEL,
  OUTREACH_QUESTION_CATEGORIES,
  OUTREACH_QUESTION_CATEGORY_LABEL,
  OUTREACH_REASONS,
  OUTREACH_REASON_LABEL,
  OUTREACH_STATUSES,
  OUTREACH_STATUS_LABEL,
  outreachAddress,
  outreachCatalog,
  outreachCatalogStart,
  outreachDayAfter,
  outreachMessage2,
  outreachAnswerCompletesTin1,
  outreachPrimarySend,
  outreachRelativeDay,
  outreachRequiredMessageId,
  OUTREACH_SCRIPT_IDS,
  type OutreachCase,
  type OutreachGroup,
  type OutreachJobId,
  type OutreachQuestionCategory,
  type OutreachReason,
  type OutreachRow,
  type OutreachStatus,
} from "@/lib/outreach";

export const OUTREACH_GROUP_TONE: Record<OutreachGroup, BadgeTone> = {
  preaccess: "violet",
  fresh: "cobalt",
  never: "crimson",
  light: "amber",
  heavy: "emerald",
};

export const OUTREACH_STATUS_TONE: Record<OutreachStatus, BadgeTone> = {
  chua_gui: "neutral",
  da_gui_tin_1: "cobalt",
  da_gui_tin_2: "cobalt",
  da_tra_loi: "emerald",
  khong_tra_loi: "amber",
  da_dung: "emerald",
};

const FOLLOW_UP_PRESETS = [
  { days: 1, label: "Ngày mai" },
  { days: 3, label: "3 ngày" },
  { days: 7, label: "1 tuần" },
] as const;

/** A decline reason is usually known once they replied or went silent. */
const REASON_STATUSES: ReadonlySet<OutreachStatus> = new Set(["da_tra_loi", "khong_tra_loi"]);

const FIELD = "flex flex-col gap-space-4";
const LABEL = "text-admin-label-sm uppercase text-admin-ink-subtle";
const MESSAGE =
  "whitespace-pre-wrap rounded-admin-control border border-admin-hairline bg-admin-subtle px-space-12 py-space-12 text-admin-body-md text-admin-ink";
const ICON_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-admin-control text-admin-ink-subtle outline-none transition-colors hover:bg-admin-subtle hover:text-admin-ink focus-visible:shadow-admin-focus disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

type FormState = {
  greetingName: string;
  groupOverride: OutreachGroup | "";
  status: OutreachStatus;
  followUp: boolean;
  followUpOn: string;
  reason: OutreachReason | "";
  feedback: string;
  featureRequest: string;
  notes: string;
};

function formFrom(row: OutreachRow): FormState {
  const outreachCase = row.outreachCase;
  return {
    greetingName: outreachAddress(outreachCase?.greetingName),
    groupOverride: outreachCase?.groupOverride ?? "",
    status: row.status,
    followUp: outreachCase?.followUp ?? false,
    followUpOn: outreachCase?.followUpOn ?? "",
    reason: outreachCase?.reason ?? "",
    feedback: outreachCase?.feedback ?? "",
    featureRequest: outreachCase?.featureRequest ?? "",
    notes: outreachCase?.notes ?? "",
  };
}

function sameForm(left: FormState, right: FormState): boolean {
  return (
    left.greetingName === right.greetingName &&
    left.groupOverride === right.groupOverride &&
    left.status === right.status &&
    left.followUp === right.followUp &&
    left.followUpOn === right.followUpOn &&
    left.reason === right.reason &&
    left.feedback === right.feedback &&
    left.featureRequest === right.featureRequest &&
    left.notes === right.notes
  );
}

function formFromCase(outreachCase: OutreachCase): FormState {
  return {
    greetingName: outreachAddress(outreachCase.greetingName),
    groupOverride: outreachCase.groupOverride ?? "",
    status: outreachCase.status,
    followUp: outreachCase.followUp,
    followUpOn: outreachCase.followUpOn ?? "",
    reason: outreachCase.reason ?? "",
    feedback: outreachCase.feedback,
    featureRequest: outreachCase.featureRequest,
    notes: outreachCase.notes,
  };
}

export function CopyButton({
  text,
  label,
  variant = "secondary",
}: {
  text: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      icon={copied ? "check" : "content_copy"}
      onClick={() => {
        if (!navigator.clipboard) return;
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? "Đã chép" : label}
    </Button>
  );
}

function Chip({
  label,
  count,
  pressed,
  tab = false,
  disabled,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  tab?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={tab ? "tab" : undefined}
      aria-selected={tab ? pressed : undefined}
      aria-pressed={tab ? undefined : pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-space-4 rounded-admin-badge border px-space-8 py-1 text-admin-body-sm outline-none focus-visible:shadow-admin-focus disabled:cursor-not-allowed disabled:opacity-50 ${
        pressed
          ? "border-admin-cobalt bg-admin-cobalt-wash font-semibold text-admin-cobalt"
          : "border-admin-hairline text-admin-ink-muted hover:bg-admin-subtle"
      }`}
    >
      {label}
      {count != null ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}

const SEND_LABEL: Record<"1" | "2" | "checkin" | "followup", string> = {
  "1": "Đã gửi tin 1",
  "2": "Đã gửi tin 2",
  checkin: "Đã nhắn hỏi thăm",
  followup: "Đã nhắn follow-up",
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function AdminOutreachCase({
  row,
  job,
  today,
  casesReady,
  position,
  onPrev,
  onNext,
  onClose,
  onSaved,
  onOpenStudent,
}: {
  row: OutreachRow;
  job: OutreachJobId | null;
  today: string;
  casesReady: boolean;
  /** Place in the open queue, or null when the person has left it. */
  position: { index: number; total: number } | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onSaved: (outreachCase: OutreachCase, advance: boolean) => void;
  onOpenStudent: (() => void) | null;
}) {
  const [form, setForm] = useState(() => formFrom(row));
  const [baseline, setBaseline] = useState(form);
  const [savedOnce, setSavedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [pane, setPane] = useState<"profile" | "questions">("profile");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false);
  const formRef = useRef(form);
  const baselineRef = useRef(form);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const closingRef = useRef(false);
  useLayoutEffect(() => {
    formRef.current = form;
  }, [form]);
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const [catalogCategory, setCatalogCategory] = useState<OutreachQuestionCategory | "all">(() =>
    outreachCatalogStart(job, row.computedCategory),
  );

  const category: OutreachGroup = form.groupOverride || row.computedCategory;
  const address = outreachAddress(form.greetingName);
  const fullCatalog = outreachCatalog(category, address);
  const requiredId = outreachRequiredMessageId(job, form.status, category);
  const required = requiredId ? (fullCatalog.find((item) => item.id === requiredId) ?? null) : null;
  const catalog = required ? fullCatalog.filter((item) => !OUTREACH_SCRIPT_IDS.has(item.id)) : fullCatalog;
  const [moreOpen, setMoreOpen] = useState(() => required == null);
  const message2 = outreachMessage2(category, address);
  const visibleCategories = OUTREACH_QUESTION_CATEGORIES.filter((item) =>
    catalog.some((question) => question.category === item),
  );
  const shownCategory =
    catalogCategory === "all" || visibleCategories.includes(catalogCategory)
      ? catalogCategory
      : (visibleCategories[0] ?? "all");
  const visibleQuestions =
    shownCategory === "all" ? catalog : catalog.filter((question) => question.category === shownCategory);
  const askedCount = catalog.filter((question) => asked.has(question.id)).length;
  const sentLabel = row.outreachCase?.sentAt ? formatAdminTimestamp(row.outreachCase.sentAt) : null;
  const dirty = !sameForm(form, baseline);

  function toggleAsked(id: string, reason: OutreachReason | null, on: boolean) {
    setAsked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    if (on && reason) setForm((current) => ({ ...current, reason }));
  }

  async function persist(extra: {
    markSent?: 1 | 2 | "checkin";
    claim?: boolean;
    status?: OutreachStatus;
    clearFollowUp?: boolean;
    advance?: boolean;
  }): Promise<boolean> {
    if (!row.email) {
      setError("Học viên này chưa có email.");
      return false;
    }
    const snapshot = formRef.current;
    const categoryNow = snapshot.groupOverride || row.computedCategory;
    const markSent =
      extra.markSent ??
      (outreachAnswerCompletesTin1(job, snapshot.status, categoryNow, snapshot.feedback, snapshot.featureRequest)
        ? 1
        : null);
    const key = markSent ? `sent-${markSent}` : extra.claim ? "claim" : "save";
    setSaving(key);
    setError(null);
    const run = saveOutreachCase({
      email: row.email,
      greetingName: snapshot.greetingName,
      groupOverride: snapshot.groupOverride || null,
      status: extra.status ?? snapshot.status,
      followUp: extra.clearFollowUp ? false : snapshot.followUp,
      followUpOn: extra.clearFollowUp ? null : snapshot.followUpOn || null,
      reason: snapshot.reason || null,
      feedback: snapshot.feedback,
      featureRequest: snapshot.featureRequest,
      notes: snapshot.notes,
      category: categoryNow,
      markSent,
      clearFollowUp: extra.clearFollowUp === true,
      claim: extra.claim === true,
      hadAccount: row.hasAccount,
      parts: row.parts,
    });
    savingRef.current = run.then((result) => result.ok);
    const result = await run;
    if (savingRef.current) savingRef.current = null;
    setSaving(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    const saved = formFromCase(result.value);
    baselineRef.current = saved;
    setBaseline(saved);
    setSavedOnce(true);
    if (sameForm(formRef.current, snapshot)) setForm(saved);
    onSaved(result.value, extra.advance === true);
    return true;
  }

  async function leave(andThen: () => void) {
    if (closingRef.current) return;
    closingRef.current = true;
    if (savingRef.current) await savingRef.current;
    const changed = !sameForm(formRef.current, baselineRef.current);
    if (changed && casesReady && row.email) {
      const ok = await persist({});
      if (!ok) {
        closingRef.current = false;
        return;
      }
    }
    andThen();
  }

  const navRef = useRef<{
    prev: (() => void) | null;
    next: (() => void) | null;
  }>({ prev: null, next: null });
  useEffect(() => {
    navRef.current = {
      prev: onPrev ? () => void leave(onPrev) : null,
      next: onNext ? () => void leave(onNext) : null,
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "j") navRef.current.next?.();
      if (event.key === "k") navRef.current.prev?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const send = outreachPrimarySend(job, form.status, category);
  const sendLabel =
    send == null ? null : job === "followup" && send === "checkin" ? SEND_LABEL.followup : SEND_LABEL[`${send}`];
  const showReason = reasonOpen || form.reason !== "" || REASON_STATUSES.has(form.status);
  const showFeedback = feedbackOpen || form.feedback !== "";
  const showWish = wishOpen || form.featureRequest !== "";
  const title = row.name?.trim() || row.email || "Học viên";
  const recipient = row.name?.trim() || "học viên";

  const saveText = !casesReady
    ? "Không lưu được"
    : saving
      ? "Đang lưu…"
      : dirty
        ? "Chưa lưu · tự lưu khi đóng"
        : savedOnce
          ? "Đã lưu"
          : "";

  return (
    <Drawer
      open
      onClose={() => void leave(onClose)}
      title={title}
      panelClassName="sm:w-[1100px] sm:max-w-[calc(100vw-24px)]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      header={
        <div className="flex flex-col gap-space-8">
          <div className="flex items-start gap-space-12">
            <div className="min-w-0 flex-1">
              <p className="truncate font-admin-display text-admin-headline-md text-admin-ink">{title}</p>
              <p className="mt-0.5 truncate text-admin-body-sm text-admin-ink-subtle">{row.email ?? "Chưa có email"}</p>
            </div>
            {position ? (
              <div className="flex shrink-0 items-center gap-space-4">
                <button
                  type="button"
                  className={ICON_BUTTON}
                  disabled={!onPrev}
                  onClick={() => {
                    if (onPrev) void leave(onPrev);
                  }}
                  aria-label="Người trước (K)"
                  title="Người trước (K)"
                >
                  <MaterialIcon name="keyboard_arrow_up" className="text-[20px]" />
                </button>
                <span className="text-admin-body-sm tabular-nums text-admin-ink-muted">
                  {position.index + 1} / {position.total}
                </span>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  disabled={!onNext}
                  onClick={() => {
                    if (onNext) void leave(onNext);
                  }}
                  aria-label="Người sau (J)"
                  title="Người sau (J)"
                >
                  <MaterialIcon name="keyboard_arrow_down" className="text-[20px]" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-space-4">
            <Badge tone={OUTREACH_GROUP_TONE[category]}>{OUTREACH_GROUP_LABEL[category]}</Badge>
            <Badge tone={OUTREACH_STATUS_TONE[form.status]} dot>
              {OUTREACH_STATUS_LABEL[form.status]}
            </Badge>
            {row.className?.trim() ? <Badge>Lớp {row.className.trim()}</Badge> : null}
            {row.parts != null ? <Badge>{row.parts} phần</Badge> : null}
            {row.activeSeconds != null ? <Badge>{formatActiveDuration(row.activeSeconds)}</Badge> : null}
            {form.groupOverride && form.groupOverride !== row.computedCategory ? (
              <span className="text-admin-body-sm text-admin-ink-subtle">
                App xếp: {OUTREACH_GROUP_LABEL[row.computedCategory]}
              </span>
            ) : null}
          </div>
        </div>
      }
      footer={
        <>
          <span className="mr-auto min-w-0 truncate text-admin-body-sm text-admin-ink-subtle" aria-live="polite">
            {saveText}
          </span>
          {dirty ? (
            <Button variant="secondary" disabled={saving !== null || !casesReady} onClick={() => void persist({})}>
              {saving === "save" ? "Đang lưu" : "Lưu"}
            </Button>
          ) : null}
          {send != null && send !== 1 && sendLabel ? (
            <Button
              variant="primary"
              icon="send"
              disabled={saving !== null || !casesReady}
              onClick={() =>
                void persist({
                  markSent: send,
                  clearFollowUp: job === "followup",
                  advance: true,
                })
              }
            >
              {saving === `sent-${send}` ? "Đang lưu" : `${sendLabel} & tiếp`}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="sticky top-0 z-10 border-b border-admin-hairline bg-admin-card px-space-20 py-space-8 lg:hidden">
          <Segmented
            ariaLabel="Phần"
            value={pane}
            options={[
              { key: "profile", label: "Hồ sơ" },
              {
                key: "questions",
                label: required ? "Tin cần gửi" : "Tin nhắn",
              },
            ]}
            onSelect={setPane}
          />
        </div>

        <div
          className={`${pane === "questions" ? "hidden" : "flex"} flex-col gap-space-16 px-space-20 py-space-16 lg:flex lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-admin-hairline`}
        >
          {!casesReady ? (
            <p className="rounded-admin-control border border-admin-amber bg-admin-amber-wash px-space-12 py-space-12 text-admin-body-sm text-admin-amber-ink">
              Chưa lưu được. Chạy supabase/outreach_cases.sql một lần, rồi tải lại trang.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-admin-control border border-admin-crimson-border bg-admin-crimson-wash px-space-12 py-space-12 text-admin-body-sm text-admin-crimson">
              {error}
            </p>
          ) : null}
          {row.conversionHint ? (
            <div className="flex flex-col gap-space-8 rounded-admin-control border border-admin-emerald bg-admin-emerald-wash px-space-12 py-space-12">
              <p className="text-admin-body-sm text-admin-emerald-ink">
                Có dấu hiệu đã đăng ký hoặc đã dùng sau khi nhắn.
              </p>
              <Button
                variant="secondary"
                disabled={saving !== null || !casesReady}
                onClick={() => void persist({ status: "da_dung" })}
              >
                Đánh dấu đã dùng
              </Button>
            </div>
          ) : null}

          <label className={FIELD}>
            <span className={LABEL}>Xưng hô</span>
            <select
              className={INPUT}
              value={address}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  greetingName: event.target.value,
                }))
              }
            >
              {OUTREACH_ADDRESSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          {category === "fresh" && message2.kind === "warning" ? (
            <p className="rounded-admin-control border border-admin-amber bg-admin-amber-wash px-space-12 py-space-12 text-admin-body-sm text-admin-amber-ink">
              {message2.text}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-space-8">
            <div className="min-w-0 text-admin-body-sm text-admin-ink-muted">
              <p>Phụ trách: {row.outreachCase?.ownerName || "chưa có"}</p>
              {sentLabel ? <p>Gửi lần cuối {sentLabel}</p> : null}
            </div>
            <Button
              variant="ghost"
              disabled={saving !== null || !casesReady}
              onClick={() => void persist({ claim: true })}
            >
              {saving === "claim" ? "Đang lưu" : "Tôi phụ trách"}
            </Button>
          </div>

          <div className={FIELD}>
            <span className={LABEL}>Hẹn follow-up</span>
            <div className="flex flex-wrap items-center gap-space-4">
              {FOLLOW_UP_PRESETS.map((preset) => {
                const day = outreachDayAfter(today, preset.days);
                return (
                  <Chip
                    key={preset.days}
                    label={preset.label}
                    pressed={form.followUp && form.followUpOn === day}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        followUp: true,
                        followUpOn: day,
                      }))
                    }
                  />
                );
              })}
              <input
                type="date"
                aria-label="Ngày follow-up"
                min={today}
                className={`${INPUT} h-8 w-auto`}
                value={form.followUpOn}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    followUp: event.target.value !== "",
                    followUpOn: event.target.value,
                  }))
                }
              />
            </div>
            {form.followUp ? (
              <div className="flex items-center justify-between gap-space-8 text-admin-body-sm text-admin-ink-muted">
                <span>
                  {form.followUpOn
                    ? `Hẹn ${form.followUpOn} (${outreachRelativeDay(form.followUpOn, today)})`
                    : "Cần follow-up, chưa chọn ngày"}
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      followUp: false,
                      followUpOn: "",
                    }))
                  }
                >
                  Bỏ hẹn
                </Button>
              </div>
            ) : null}
          </div>

          {showReason ? (
            <label className={FIELD}>
              <span className={LABEL}>Lý do từ chối</span>
              <select
                className={INPUT}
                value={form.reason}
                onChange={(event) => {
                  const reason = event.target.value as OutreachReason | "";
                  setForm((current) => ({ ...current, reason }));
                  if (reason) {
                    setCatalogCategory(category === "preaccess" ? "signup" : "stop");
                    setMoreOpen(true);
                  }
                }}
              >
                <option value="">Chưa chọn</option>
                {OUTREACH_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {OUTREACH_REASON_LABEL[reason]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className={FIELD}>
            <span className={LABEL}>Ghi chú</span>
            <textarea
              className={`${INPUT} h-auto min-h-20 py-space-8`}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
          {showFeedback ? (
            <label className={FIELD}>
              <span className={LABEL}>Feedback chung</span>
              <textarea
                className={`${INPUT} h-auto min-h-28 py-space-8`}
                value={form.feedback}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    feedback: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
          {showWish ? (
            <label className={FIELD}>
              <span className={LABEL}>Yêu cầu tính năng</span>
              <textarea
                className={`${INPUT} h-auto min-h-20 py-space-8`}
                value={form.featureRequest}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    featureRequest: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
          {!showReason || !showFeedback || !showWish ? (
            <div className="flex flex-wrap gap-space-4">
              {!showReason ? (
                <Button variant="ghost" icon="add" onClick={() => setReasonOpen(true)}>
                  Lý do từ chối
                </Button>
              ) : null}
              {!showFeedback ? (
                <Button variant="ghost" icon="add" onClick={() => setFeedbackOpen(true)}>
                  Feedback
                </Button>
              ) : null}
              {!showWish ? (
                <Button variant="ghost" icon="add" onClick={() => setWishOpen(true)}>
                  Yêu cầu tính năng
                </Button>
              ) : null}
            </div>
          ) : null}

          <details className="group rounded-admin-control border border-admin-hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between px-space-12 py-space-8 text-admin-body-sm font-semibold text-admin-ink-muted outline-none focus-visible:shadow-admin-focus">
              Sửa tay nhóm và trạng thái
              <MaterialIcon name="expand_more" className="text-[18px] transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-space-12 border-t border-admin-hairline px-space-12 py-space-12">
              <label className={FIELD}>
                <span className={LABEL}>Nhóm user</span>
                <select
                  className={INPUT}
                  value={form.groupOverride}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      groupOverride: event.target.value as OutreachGroup | "",
                    }))
                  }
                >
                  <option value="">Tự động ({OUTREACH_GROUP_LABEL[row.computedCategory]})</option>
                  {OUTREACH_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {OUTREACH_GROUP_LABEL[group]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD}>
                <span className={LABEL}>Trạng thái</span>
                <select
                  className={INPUT}
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as OutreachStatus,
                    }))
                  }
                >
                  {OUTREACH_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {OUTREACH_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>

          {onOpenStudent ? (
            <Button variant="ghost" icon="person" onClick={() => void leave(onOpenStudent)}>
              Hồ sơ học viên
            </Button>
          ) : null}
        </div>

        <section
          className={`${pane === "profile" ? "hidden" : "flex"} min-h-[28rem] min-w-0 flex-1 flex-col lg:flex lg:min-h-0`}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-space-24 overflow-y-auto overscroll-contain px-space-20 py-space-16">
            {category === "fresh" ? (
              <p className="text-admin-body-sm text-admin-ink-muted">
                Nhóm Mới chưa nhắn. Chờ đủ 3 ngày, trừ khi em ấy đã học nhiều.
              </p>
            ) : required?.message ? (
              <div className="flex flex-col gap-space-12 rounded-admin-card border-2 border-admin-cobalt bg-admin-card p-space-16 shadow-admin-card">
                <div className="flex flex-wrap items-center gap-space-8">
                  <Badge tone="cobalt" solid>
                    Bắt buộc
                  </Badge>
                  <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">
                    Tin cần gửi: {required.label}
                  </h3>
                </div>
                <ol className="flex list-decimal flex-col gap-1 pl-space-20 text-admin-body-sm text-admin-ink-muted">
                  <li>
                    Chép tin bên dưới. Tin đã đổi theo nhóm{" "}
                    <span className="font-semibold text-admin-ink">{OUTREACH_GROUP_LABEL[category]}</span> và xưng hô{" "}
                    <span className="font-semibold text-admin-ink">{address}</span>.
                  </li>
                  <li>Dán vào tin nhắn riêng cho {recipient} và gửi.</li>
                  <li>
                    {send === 1 ? (
                      <>Khi có câu trả lời, ghi vào Feedback hoặc Yêu cầu tính năng. Người này được tính là xong.</>
                    ) : (
                      <>
                        Bấm <span className="font-semibold text-admin-ink">{sendLabel} &amp; tiếp</span> ở cuối khung.
                      </>
                    )}
                  </li>
                </ol>
                {message2.kind === "warning" ? (
                  <p className="rounded-admin-control border border-admin-amber bg-admin-amber-wash px-space-12 py-space-8 text-admin-body-sm text-admin-amber-ink">
                    {message2.text}
                  </p>
                ) : null}
                <p className={MESSAGE}>{required.message}</p>
                <div>
                  <CopyButton variant="primary" text={required.message} label="Chép tin nhắn" />
                </div>
              </div>
            ) : job === "followup" ? (
              <div className="flex flex-col gap-space-12 rounded-admin-card border-2 border-admin-amber bg-admin-card p-space-16 shadow-admin-card">
                <div className="flex flex-wrap items-center gap-space-8">
                  <Badge tone="amber" solid>
                    Bắt buộc
                  </Badge>
                  <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">Follow-up: tự viết tin</h3>
                </div>
                <ol className="flex list-decimal flex-col gap-1 pl-space-20 text-admin-body-sm text-admin-ink-muted">
                  <li>Đọc ghi chú lần trước bên dưới.</li>
                  <li>Viết một tin riêng cho {recipient}. Có thể dùng câu hỏi thêm ở dưới.</li>
                  <li>
                    Bấm <span className="font-semibold text-admin-ink">{sendLabel} &amp; tiếp</span> ở cuối khung.
                  </li>
                </ol>
                <p className={MESSAGE}>{form.notes.trim() || "Chưa có ghi chú."}</p>
              </div>
            ) : message2.kind === "warning" ? (
              <p className="text-admin-body-sm text-admin-amber-ink">{message2.text}</p>
            ) : null}

            {catalog.length > 0 ? (
              <div className="flex flex-col gap-space-12">
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((open) => !open)}
                  className="-mx-space-8 flex items-center justify-between gap-space-8 rounded-admin-control px-space-8 py-space-4 text-left outline-none hover:bg-admin-subtle focus-visible:shadow-admin-focus"
                >
                  <span className="flex flex-wrap items-center gap-space-8">
                    <span className="font-admin-display text-admin-headline-sm text-admin-ink">
                      {required ? "Câu hỏi thêm" : "Tin nhắn và câu hỏi"}
                    </span>
                    {required ? <Badge>Hỏi thêm</Badge> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-space-4 text-admin-body-sm text-admin-ink-muted">
                    Đã hỏi {askedCount}/{catalog.length}
                    <MaterialIcon
                      name="expand_more"
                      className={`text-[20px] transition-transform ${moreOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
                {required ? (
                  <p className="-mt-space-8 text-admin-body-sm text-admin-ink-muted">
                    Dùng khi học viên đã trả lời và bạn muốn hỏi sâu hơn. Chọn 1–2 câu hợp, không cần gửi hết.
                  </p>
                ) : null}
                {moreOpen ? (
                  <>
                    {visibleCategories.length > 0 ? (
                      <div className="flex flex-wrap gap-space-4" role="tablist" aria-label="Nhóm câu hỏi">
                        <Chip
                          tab
                          label="Tất cả"
                          count={catalog.length - askedCount}
                          pressed={shownCategory === "all"}
                          onClick={() => setCatalogCategory("all")}
                        />
                        {visibleCategories.map((item) => {
                          const inCategory = catalog.filter((question) => question.category === item);
                          const left = inCategory.filter((question) => !asked.has(question.id)).length;
                          return (
                            <Chip
                              tab
                              key={item}
                              label={OUTREACH_QUESTION_CATEGORY_LABEL[item]}
                              count={left}
                              pressed={shownCategory === item}
                              onClick={() => setCatalogCategory(item)}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                    <ul className="flex flex-col gap-space-12">
                      {visibleQuestions.map((question) => {
                        const checked = asked.has(question.id);
                        const matchesReason = question.reason != null && question.reason === form.reason;
                        return (
                          <li
                            key={question.id}
                            className={`flex flex-col gap-space-8 rounded-admin-control border px-space-12 py-space-12 ${
                              matchesReason ? "border-admin-cobalt bg-admin-cobalt-wash" : "border-admin-hairline"
                            }`}
                          >
                            <label className="flex items-start gap-space-8 text-admin-body-md text-admin-ink">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={(event) => toggleAsked(question.id, question.reason, event.target.checked)}
                              />
                              <span>
                                <span className="font-semibold">{question.label}</span>
                                {shownCategory === "all" ? (
                                  <span className="ml-space-8 text-admin-body-sm text-admin-ink-subtle">
                                    {OUTREACH_QUESTION_CATEGORY_LABEL[question.category]}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                            {question.message ? (
                              <>
                                <p className={MESSAGE}>{question.message}</p>
                                <div>
                                  <CopyButton text={question.message} label="Chép câu hỏi" />
                                </div>
                              </>
                            ) : null}
                            {question.reply ? (
                              <>
                                <p className={LABEL}>Nếu em ấy trả lời theo hướng này</p>
                                <p className={MESSAGE}>{question.reply}</p>
                                <div>
                                  <CopyButton text={question.reply} label="Chép câu trả lời" />
                                </div>
                              </>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Drawer>
  );
}
