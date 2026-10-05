"use client";

import Link from "next/link";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  formatAdminTimestamp,
  type AdminHealthBoard,
  type AdminHealthCheck,
  type AdminHealthStatus,
} from "@/lib/admin-overview";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatWhen(iso: string): string {
  return formatAdminTimestamp(iso) ?? "—";
}

function overallCopy(status: AdminHealthBoard["overall"]): {
  title: string;
  hint: string;
} {
  if (status === "ok") {
    return {
      title: "All clear",
      hint: "Env, SQL, and urgent disk files look usable.",
    };
  }
  if (status === "warn") {
    return {
      title: "Needs attention",
      hint: "The app can run, but a column or file is incomplete.",
    };
  }
  return {
    title: "Broken",
    hint: "A required env var or table is missing. Learner features will fail.",
  };
}

function statusLabel(status: AdminHealthStatus): string {
  if (status === "ok") return "OK";
  if (status === "warn") return "Warn";
  if (status === "fail") return "Fail";
  return "Skip";
}

function StatusChip({ status }: { status: AdminHealthStatus }) {
  const tone =
    status === "ok"
      ? "bg-primary-fixed text-on-primary-fixed"
      : status === "fail"
        ? "bg-error-container text-on-error-container"
        : "bg-surface-container-high text-on-surface-variant";
  return (
    <span
      className={`inline-flex items-center rounded-full px-space-12 py-1 font-label-sm text-label-sm font-semibold ${tone}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  hint,
  danger = false,
}: {
  label: string;
  value: string;
  icon: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-space-16 shadow-sm">
      <div className="flex items-center gap-space-8">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            danger
              ? "bg-error-container text-on-error-container"
              : "bg-primary-fixed text-on-primary-fixed"
          }`}
        >
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

function CheckTable({
  title,
  hint,
  checks,
  showSql,
}: {
  title: string;
  hint: string;
  checks: readonly AdminHealthCheck[];
  showSql?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">{title}</h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">{hint}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Check</th>
              <th className="px-space-12 py-space-8">Status</th>
              {showSql ? <th className="px-space-12 py-space-8">SQL</th> : null}
              <th className="px-space-16 py-space-8">Detail</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr
                key={check.id}
                className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
              >
                <td className="px-space-16 py-space-8 font-medium">{check.label}</td>
                <td className="px-space-12 py-space-8">
                  <StatusChip status={check.status} />
                </td>
                {showSql ? (
                  <td className="px-space-12 py-space-8 font-caption text-caption text-on-surface-variant">
                    {check.sqlFile ?? "—"}
                  </td>
                ) : null}
                <td className="px-space-16 py-space-8 text-on-surface-variant">{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminHealth({ board }: { board: AdminHealthBoard }) {
  const copy = overallCopy(board.overall);
  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="System"
        title="Health"
        subtitle="Whether this deploy can sign in, write to Supabase, and play listed files. Catalog still owns the lesson inventory."
      />

      <p className="font-caption text-caption text-on-surface-variant">
        Checked {formatWhen(board.checkedAt)}. Values are never shown.
      </p>

      <section
        aria-label="Health totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-4"
      >
        <SummaryStat
          label="Overall"
          value={copy.title}
          icon={board.overall === "ok" ? "verified" : "monitor_heart"}
          hint={copy.hint}
          danger={board.overall === "fail"}
        />
        <SummaryStat
          label="Env"
          value={`${formatCount(board.envOk)}/${formatCount(board.envTotal)}`}
          icon="vpn_key"
          hint="Required Auth.js and Supabase secrets"
        />
        <SummaryStat
          label="Stores"
          value={`${formatCount(board.storeOk)}/${formatCount(board.storeTotal)}`}
          icon="database"
          hint="Tables and clip_outcome_totals, head-only"
        />
        <SummaryStat
          label="Files"
          value={
            board.contentIssues > 0
              ? formatCount(board.contentIssues)
              : `${formatCount(board.lessonsReady)}/${formatCount(board.lessonsListed)}`
          }
          icon="folder"
          hint={
            board.contentIssues > 0
              ? "Urgent Catalog issues"
              : "Playable lessons of those listed"
          }
        />
      </section>

      <CheckTable
        title="Environment"
        hint="Present or missing only. Slack is optional and never fails this page."
        checks={board.env}
      />

      <CheckTable
        title="Supabase schema"
        hint="Head requests. Run the listed SQL once in the editor if a table is missing."
        checks={board.stores}
        showSql
      />

      <CheckTable
        title="Disk files"
        hint={`${formatCount(board.clipsMissingAudio)} clips without audio. ${formatCount(board.videosBroken)} broken video URLs.`}
        checks={board.content}
      />

      {board.issues.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-error-container bg-error-container/30 shadow-sm">
          <div className="px-space-16 py-space-12">
            <h2 className="font-label-md text-label-md font-semibold text-on-error-container">
              Urgent files
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-error-container/80">
              Same list as Catalog. Empty placeholder lessons stay on that page.
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

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Lesson-by-lesson inventory is on{" "}
        <Link href="/admin/content" className="font-semibold text-primary underline-offset-2 hover:underline">
          Catalog
        </Link>
        . Clip miss rates and finished parts stay on Practice clip difficulty and Practice.
      </p>
    </main>
  );
}
