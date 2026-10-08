"use client";

import { useRef, useState } from "react";
import { saveOutreachCase } from "@/app/admin/outreach/actions";
import { Button, Drawer, INPUT } from "@/components/admin/AdminUi";
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
  outreachMessage2,
  type OutreachCase,
  type OutreachGroup,
  type OutreachJobId,
  type OutreachQuestionCategory,
  type OutreachReason,
  type OutreachRow,
  type OutreachStatus,
} from "@/lib/outreach";

const FIELD = "flex flex-col gap-space-4";
const LABEL = "text-admin-label-sm uppercase text-admin-ink-subtle";
const MESSAGE =
  "whitespace-pre-wrap rounded-admin-control border border-admin-hairline bg-admin-subtle px-space-12 py-space-12 text-admin-body-md text-admin-ink";

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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
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

function CatalogTab({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-space-4 rounded-admin-badge border px-space-8 py-1 text-admin-body-sm outline-none focus-visible:shadow-admin-focus ${
        pressed
          ? "border-admin-cobalt bg-admin-cobalt-wash font-semibold text-admin-cobalt"
          : "border-admin-hairline text-admin-ink-muted hover:bg-admin-subtle"
      }`}
    >
      {label}
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

export function AdminOutreachCase({
  row,
  job,
  casesReady,
  onClose,
  onSaved,
  onOpenStudent,
}: {
  row: OutreachRow;
  job: OutreachJobId | null;
  casesReady: boolean;
  onClose: () => void;
  onSaved: (outreachCase: OutreachCase, advance: boolean) => void;
  onOpenStudent: (() => void) | null;
}) {
  const [form, setForm] = useState(() => formFrom(row));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const formRef = useRef(form);
  const baselineRef = useRef(form);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const closingRef = useRef(false);
  formRef.current = form;
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const [catalogCategory, setCatalogCategory] = useState<OutreachQuestionCategory | "all">(() =>
    outreachCatalogStart(job, row.computedCategory),
  );

  const category: OutreachGroup = form.groupOverride || row.computedCategory;
  const address = outreachAddress(form.greetingName);
  const catalog = outreachCatalog(category, address);
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
    const key = extra.markSent ? `sent-${extra.markSent}` : extra.claim ? "claim" : "save";
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
      category: snapshot.groupOverride || row.computedCategory,
      markSent: extra.markSent ?? null,
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
    if (sameForm(formRef.current, snapshot)) setForm(saved);
    onSaved(result.value, extra.advance === true);
    return true;
  }

  async function leave(andThen: () => void) {
    if (closingRef.current) return;
    closingRef.current = true;
    if (savingRef.current) await savingRef.current;
    const dirty = !sameForm(formRef.current, baselineRef.current);
    if (dirty && casesReady && row.email) {
      const ok = await persist({});
      if (!ok) {
        closingRef.current = false;
        return;
      }
    }
    andThen();
  }

  const clearOnSend = job === "followup";
  const tin1Sent = form.status !== "chua_gui";
  const canTin2 =
    (category === "heavy" || category === "light" || category === "never") &&
    (form.status === "da_gui_tin_1" || form.status === "da_tra_loi" || form.status === "khong_tra_loi");

  return (
    <Drawer
      open
      onClose={() => void leave(onClose)}
      title={row.name?.trim() || row.email || "Học viên"}
      subtitle={row.email ?? "Chưa có email"}
      panelClassName="sm:w-[1100px] sm:max-w-[calc(100vw-24px)]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="flex flex-col gap-space-16 px-space-20 py-space-16 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-admin-hairline">
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

        <dl className="grid grid-cols-2 gap-space-12 text-admin-body-sm">
          <div>
            <dt className={LABEL}>Lớp</dt>
            <dd className="text-admin-ink">{row.className?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className={LABEL}>Nhóm theo app</dt>
            <dd className="text-admin-ink">{OUTREACH_GROUP_LABEL[row.computedCategory]}</dd>
          </div>
          <div>
            <dt className={LABEL}>Phần đã học</dt>
            <dd className="text-admin-ink">{row.parts == null ? "—" : row.parts}</dd>
          </div>
          <div>
            <dt className={LABEL}>Thời gian</dt>
            <dd className="text-admin-ink">
              {row.activeSeconds == null ? "—" : formatActiveDuration(row.activeSeconds)}
            </dd>
          </div>
        </dl>

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
          <span className={LABEL}>Xưng hô</span>
          <select
            className={INPUT}
            value={address}
            onChange={(event) => setForm((current) => ({ ...current, greetingName: event.target.value }))}
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

        <div className="flex flex-wrap gap-space-8">
          <Button
            variant="secondary"
            icon="send"
            disabled={saving !== null || !casesReady || tin1Sent}
            onClick={() => void persist({ markSent: 1, clearFollowUp: clearOnSend, advance: true })}
          >
            {saving === "sent-1" ? "Đang lưu" : "Đánh dấu đã gửi tin 1"}
          </Button>
          {category !== "preaccess" && category !== "fresh" ? (
            <Button
              variant="secondary"
              icon="send"
              disabled={saving !== null || !casesReady || !canTin2}
              onClick={() => void persist({ markSent: 2, clearFollowUp: clearOnSend, advance: true })}
            >
              {saving === "sent-2" ? "Đang lưu" : "Đánh dấu đã gửi tin 2"}
            </Button>
          ) : null}
          {job === "quiet" ? (
            <Button
              variant="primary"
              icon="send"
              disabled={saving !== null || !casesReady}
              onClick={() => void persist({ markSent: "checkin", advance: true })}
            >
              {saving === "sent-checkin" ? "Đang lưu" : "Đánh dấu đã nhắn"}
            </Button>
          ) : null}
        </div>
        {sentLabel ? (
          <p className="text-admin-body-sm text-admin-ink-muted">
            Gửi lần cuối {sentLabel}
            {row.outreachCase?.ownerName ? ` · ${row.outreachCase.ownerName}` : ""}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-space-8">
          <p className="text-admin-body-sm text-admin-ink-muted">
            Người phụ trách: {row.outreachCase?.ownerName || "chưa có"}
          </p>
          <Button
            variant="ghost"
            disabled={saving !== null || !casesReady}
            onClick={() => void persist({ claim: true })}
          >
            {saving === "claim" ? "Đang lưu" : "Tôi phụ trách"}
          </Button>
        </div>

        <label className={FIELD}>
          <span className={LABEL}>Trạng thái</span>
          <select
            className={INPUT}
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({ ...current, status: event.target.value as OutreachStatus }))
            }
          >
            {OUTREACH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {OUTREACH_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-space-8 text-admin-body-md text-admin-ink">
          <input
            type="checkbox"
            checked={form.followUp}
            onChange={(event) => setForm((current) => ({ ...current, followUp: event.target.checked }))}
          />
          Cần follow-up
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Ngày follow-up</span>
          <input
            type="date"
            className={INPUT}
            value={form.followUpOn}
            onChange={(event) => setForm((current) => ({ ...current, followUpOn: event.target.value }))}
          />
        </label>

        <label className={FIELD}>
          <span className={LABEL}>Lý do từ chối</span>
          <select
            className={INPUT}
            value={form.reason}
            onChange={(event) => {
              const reason = event.target.value as OutreachReason | "";
              setForm((current) => ({ ...current, reason }));
              if (reason) setCatalogCategory(category === "preaccess" ? "signup" : "stop");
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

        <label className={FIELD}>
          <span className={LABEL}>Feedback chung</span>
          <textarea
            className={`${INPUT} h-auto min-h-28 py-space-8`}
            value={form.feedback}
            onChange={(event) => setForm((current) => ({ ...current, feedback: event.target.value }))}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Yêu cầu tính năng</span>
          <textarea
            className={`${INPUT} h-auto min-h-20 py-space-8`}
            value={form.featureRequest}
            onChange={(event) => setForm((current) => ({ ...current, featureRequest: event.target.value }))}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Ghi chú</span>
          <textarea
            className={`${INPUT} h-auto min-h-16 py-space-8`}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>

        {onOpenStudent ? (
          <Button variant="ghost" icon="person" onClick={() => void leave(onOpenStudent)}>
            Hồ sơ học viên
          </Button>
        ) : null}
      </div>

      <section className="flex min-h-[28rem] min-w-0 flex-1 flex-col border-t border-admin-hairline lg:min-h-0 lg:border-t-0">
        <div className="flex shrink-0 flex-col gap-space-8 border-b border-admin-hairline bg-admin-card px-space-20 py-space-12">
          <div className="flex items-baseline justify-between gap-space-8">
            <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">Câu hỏi</h3>
            <p className="text-admin-body-sm text-admin-ink-muted">
              {catalog.length === 0 ? "Chưa có câu để hỏi" : `Đã hỏi ${askedCount}/${catalog.length}`}
            </p>
          </div>
          {message2.kind === "warning" && category !== "fresh" ? (
            <p className="text-admin-body-sm text-admin-amber-ink">{message2.text}</p>
          ) : null}
          {visibleCategories.length > 0 ? (
            <div className="flex flex-wrap gap-space-4" role="tablist" aria-label="Nhóm câu hỏi">
              <CatalogTab
                label="Tất cả"
                count={catalog.length - askedCount}
                pressed={shownCategory === "all"}
                onClick={() => setCatalogCategory("all")}
              />
              {visibleCategories.map((item) => {
                const inCategory = catalog.filter((question) => question.category === item);
                const left = inCategory.filter((question) => !asked.has(question.id)).length;
                return (
                  <CatalogTab
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
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-space-20 py-space-16">
          {catalog.length === 0 ? (
            <p className="text-admin-body-sm text-admin-ink-muted">
              Nhóm Mới chưa có câu hỏi. Chờ đủ 3 ngày, trừ khi em ấy đã học nhiều.
            </p>
          ) : (
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
          )}
        </div>
      </section>
      </div>
    </Drawer>
  );
}
