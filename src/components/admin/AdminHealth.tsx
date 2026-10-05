"use client";

import Link from "next/link";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  HeaderChip,
  KpiTile,
  Mono,
  StatusPill,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
import {
  formatAdminTimestamp,
  type AdminHealthBoard,
  type AdminHealthCheck,
  type AdminHealthStatus,
} from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

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

const STATUS_TONE: Record<AdminHealthStatus, "good" | "warn" | "bad" | "muted"> = {
  ok: "good",
  warn: "warn",
  fail: "bad",
  skip: "muted",
};

const OVERALL_COLOR: Record<AdminHealthBoard["overall"], string> = {
  ok: ADMIN_COLORS.emerald,
  warn: ADMIN_COLORS.amber,
  fail: ADMIN_COLORS.crimson,
};

/** Env keys and table names read as code; plain-language labels stay in Inter. */
function isIdentifier(label: string): boolean {
  return /^[A-Za-z0-9_.]+$/.test(label) && /[_A-Z]/.test(label.slice(1));
}

function CheckTable({
  icon,
  title,
  hint,
  checks,
  showSql,
}: {
  icon: string;
  title: string;
  hint: string;
  checks: readonly AdminHealthCheck[];
  showSql?: boolean;
}) {
  const failing = checks.some((check) => check.status === "fail");
  const warning = checks.some((check) => check.status === "warn");
  return (
    <TablePanel
      icon={icon}
      title={title}
      hint={hint}
      color={failing ? ADMIN_COLORS.crimson : warning ? ADMIN_COLORS.amber : ADMIN_COLORS.emerald}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Check</th>
              <th className={TH}>Status</th>
              {showSql ? <th className={TH}>SQL</th> : null}
              <th className={TH}>Detail</th>
            </tr>
          </thead>
          <tbody className="text-admin-body-sm text-admin-ink">
            {checks.map((check) => (
              <tr key={check.id} className={TR}>
                <td className="px-space-16 py-space-8 font-semibold">
                  {isIdentifier(check.label) ? <Mono>{check.label}</Mono> : check.label}
                </td>
                <td className="px-space-16 py-space-8">
                  <StatusPill label={statusLabel(check.status)} tone={STATUS_TONE[check.status]} />
                </td>
                {showSql ? (
                  <td className="px-space-16 py-space-8 text-admin-ink-muted">
                    {check.sqlFile ? <Mono>{check.sqlFile}</Mono> : "—"}
                  </td>
                ) : null}
                <td className="px-space-16 py-space-8 text-admin-ink-muted">{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TablePanel>
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
        trailing={
          <HeaderChip icon="schedule">
            Checked {formatWhen(board.checkedAt)} · values never shown
          </HeaderChip>
        }
      />

      <section aria-label="Health totals" className="grid grid-cols-2 gap-space-16 md:grid-cols-4">
        <KpiTile
          icon={board.overall === "ok" ? "verified" : board.overall === "warn" ? "warning" : "error"}
          label="Overall"
          value={copy.title}
          caption={copy.hint}
          color={OVERALL_COLOR[board.overall]}
        />
        <KpiTile
          icon="vpn_key"
          label="Env"
          value={`${formatCount(board.envOk)}/${formatCount(board.envTotal)}`}
          caption="Required Auth.js and Supabase secrets"
          color={board.envOk < board.envTotal ? ADMIN_COLORS.crimson : ADMIN_COLORS.emerald}
          progress={board.envTotal > 0 ? board.envOk / board.envTotal : 0}
          progressLabel="Env checks passing"
        />
        <KpiTile
          icon="database"
          label="Stores"
          value={`${formatCount(board.storeOk)}/${formatCount(board.storeTotal)}`}
          caption="Tables and clip_outcome_totals, head-only"
          color={board.storeOk < board.storeTotal ? ADMIN_COLORS.amber : ADMIN_COLORS.emerald}
          progress={board.storeTotal > 0 ? board.storeOk / board.storeTotal : 0}
          progressLabel="Store checks passing"
        />
        <KpiTile
          icon="folder"
          label="Files"
          value={
            board.contentIssues > 0
              ? formatCount(board.contentIssues)
              : `${formatCount(board.lessonsReady)}/${formatCount(board.lessonsListed)}`
          }
          caption={board.contentIssues > 0 ? "Urgent Catalog issues" : "Playable lessons of those listed"}
          color={board.contentIssues > 0 ? ADMIN_COLORS.crimson : ADMIN_COLORS.emerald}
        />
      </section>

      <CheckTable
        icon="vpn_key"
        title="Environment"
        hint="Present or missing only. Slack is optional and never fails this page."
        checks={board.env}
      />

      <CheckTable
        icon="database"
        title="Supabase schema"
        hint="Head requests. Run the listed SQL once in the editor if a table is missing."
        checks={board.stores}
        showSql
      />

      <CheckTable
        icon="folder"
        title="Disk files"
        hint={`${formatCount(board.clipsMissingAudio)} clips without audio. ${formatCount(board.videosBroken)} broken video URLs.`}
        checks={board.content}
      />

      {board.issues.length > 0 ? (
        <TablePanel
          icon="report"
          title="Urgent files"
          hint="Same list as Catalog. Empty placeholder lessons stay on that page."
          color={ADMIN_COLORS.crimson}
        >
          <ul className="flex flex-col">
            {board.issues.map((issue) => (
              <li
                key={issue.id}
                className="flex items-start gap-space-12 border-t border-admin-hairline border-l-2 border-l-admin-crimson px-space-16 py-space-12 first:border-t-0 sm:px-space-20"
              >
                <MaterialIcon name="error" className="mt-0.5 text-[18px] text-admin-crimson" filled />
                <div className="min-w-0">
                  <p className="text-admin-body-md font-semibold text-admin-ink">{issue.label}</p>
                  <p className="text-admin-body-sm text-admin-ink-muted">{issue.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </TablePanel>
      ) : null}

      <p className="text-admin-body-sm text-admin-ink-muted">
        Lesson-by-lesson inventory is on{" "}
        <Link href="/admin/content" className="rounded-admin-badge font-semibold text-admin-cobalt underline-offset-2 outline-none hover:underline focus-visible:shadow-admin-focus">
          Catalog
        </Link>
        . Clip miss rates and finished parts stay on Practice clip difficulty and Practice.
      </p>
    </main>
  );
}
