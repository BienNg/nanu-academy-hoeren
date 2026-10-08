"use client";

import { useState } from "react";
import { saveOutreachCase } from "@/app/admin/outreach/actions";
import { Button, Drawer, INPUT } from "@/components/admin/AdminUi";
import { formatAdminTimestamp } from "@/lib/admin-overview";
import { formatActiveDuration } from "@/lib/progress";
import {
  OUTREACH_GROUPS,
  OUTREACH_GROUP_LABEL,
  OUTREACH_REASONS,
  OUTREACH_REASON_LABEL,
  OUTREACH_STATUSES,
  OUTREACH_STATUS_LABEL,
  outreachGreetingName,
  outreachMessage1,
  outreachMessage2,
  outreachObjectionReply,
  type OutreachCase,
  type OutreachGroup,
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
    greetingName: outreachCase?.greetingName ?? "",
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

export function AdminOutreachCase({
  row,
  casesReady,
  onClose,
  onSaved,
  onOpenStudent,
}: {
  row: OutreachRow;
  casesReady: boolean;
  onClose: () => void;
  onSaved: (outreachCase: OutreachCase) => void;
  onOpenStudent: (() => void) | null;
}) {
  const [form, setForm] = useState(() => formFrom(row));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const category: OutreachGroup = form.groupOverride || row.computedCategory;
  const greeting = outreachGreetingName(row.name, form.greetingName);
  const message1 = outreachMessage1(category, greeting);
  const message2 = outreachMessage2(category);
  const reply = form.reason ? outreachObjectionReply(form.reason) : null;
  const sentLabel = row.outreachCase?.sentAt ? formatAdminTimestamp(row.outreachCase.sentAt) : null;

  async function persist(extra: { markSent?: 1 | 2; claim?: boolean; status?: OutreachStatus }) {
    if (!row.email) {
      setError("Học viên này chưa có email.");
      return;
    }
    const key = extra.markSent ? `sent-${extra.markSent}` : extra.claim ? "claim" : "save";
    setSaving(key);
    setError(null);
    const result = await saveOutreachCase({
      email: row.email,
      greetingName: form.greetingName,
      groupOverride: form.groupOverride || null,
      status: extra.status ?? form.status,
      followUp: form.followUp,
      followUpOn: form.followUpOn || null,
      reason: form.reason || null,
      feedback: form.feedback,
      featureRequest: form.featureRequest,
      notes: form.notes,
      category,
      markSent: extra.markSent ?? null,
      claim: extra.claim === true,
      hadAccount: row.hasAccount,
      parts: row.parts,
    });
    setSaving(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.value);
  }

  const tin1Sent = form.status !== "chua_gui";
  const canTin2 = category !== "preaccess" && (form.status === "da_gui_tin_1" || form.status === "da_tra_loi" || form.status === "khong_tra_loi");

  return (
    <Drawer
      open
      onClose={onClose}
      title={row.name?.trim() || row.email || "Học viên"}
      subtitle={row.email ?? "Chưa có email"}
      panelClassName="sm:w-[560px]"
      footer={
        <Button
          variant="primary"
          icon="save"
          disabled={saving !== null || !casesReady || !row.email}
          onClick={() => void persist({})}
        >
          {saving === "save" ? "Đang lưu" : "Lưu"}
        </Button>
      }
    >
      <div className="flex flex-col gap-space-16 px-space-20 py-space-16">
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
          <span className={LABEL}>Tên trong lời chào</span>
          <input
            className={INPUT}
            value={form.greetingName}
            placeholder={row.name?.trim() || "em"}
            onChange={(event) => setForm((current) => ({ ...current, greetingName: event.target.value }))}
          />
        </label>

        <section className="flex flex-col gap-space-8">
          <div className="flex items-center justify-between gap-space-8">
            <h3 className={LABEL}>Tin nhắn 1</h3>
            <CopyButton text={message1} label="Chép tin 1" />
          </div>
          <p className={MESSAGE}>{message1}</p>
        </section>

        <section className="flex flex-col gap-space-8">
          <div className="flex items-center justify-between gap-space-8">
            <h3 className={LABEL}>Tin nhắn 2</h3>
            {message2.kind === "message" ? <CopyButton text={message2.text} label="Chép tin 2" /> : null}
          </div>
          {message2.kind === "warning" ? (
            <p className="rounded-admin-control border border-admin-amber bg-admin-amber-wash px-space-12 py-space-12 text-admin-body-sm text-admin-amber-ink">
              {message2.text}
            </p>
          ) : (
            <p className={MESSAGE}>{message2.text}</p>
          )}
        </section>

        <div className="flex flex-wrap gap-space-8">
          <Button
            variant="secondary"
            icon="send"
            disabled={saving !== null || !casesReady || tin1Sent}
            onClick={() => void persist({ markSent: 1 })}
          >
            {saving === "sent-1" ? "Đang lưu" : "Đánh dấu đã gửi tin 1"}
          </Button>
          {category !== "preaccess" ? (
            <Button
              variant="secondary"
              icon="send"
              disabled={saving !== null || !casesReady || !canTin2}
              onClick={() => void persist({ markSent: 2 })}
            >
              {saving === "sent-2" ? "Đang lưu" : "Đánh dấu đã gửi tin 2"}
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
            onChange={(event) =>
              setForm((current) => ({ ...current, reason: event.target.value as OutreachReason | "" }))
            }
          >
            <option value="">Chưa chọn</option>
            {OUTREACH_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {OUTREACH_REASON_LABEL[reason]}
              </option>
            ))}
          </select>
        </label>
        {reply ? (
          <section className="flex flex-col gap-space-8">
            <div className="flex items-center justify-between gap-space-8">
              <h3 className={LABEL}>Câu trả lời cho CS gửi</h3>
              {reply.kind === "message" ? <CopyButton text={reply.text} label="Chép câu trả lời" /> : null}
            </div>
            <p className={reply.kind === "note" ? "text-admin-body-sm text-admin-ink-muted" : MESSAGE}>
              {reply.text}
            </p>
          </section>
        ) : null}

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
          <Button variant="ghost" icon="person" onClick={onOpenStudent}>
            Hồ sơ học viên
          </Button>
        ) : null}
      </div>
    </Drawer>
  );
}
