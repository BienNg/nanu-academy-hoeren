"use client";

import { MaterialIcon } from "@/components/admin/AdminShell";
import { ColumnHeader, Panel, formatAbsoluteTime } from "@/components/admin/student-detail/shared";
import type { AdminUserRow } from "@/lib/admin-overview";
import { signInSummary } from "@/lib/progress";

/** Rows shown per list before the "+N more" line. */
const LIST_LIMIT = 8;

function DeviceList({
  title,
  icon,
  empty,
  entries,
}: {
  title: string;
  icon: string;
  empty: string;
  entries: readonly (AdminUserRow["signIns"][number] | AdminUserRow["appUses"][number])[];
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-space-12">
      <ColumnHeader title={title} />
      <Panel>
        {entries.length === 0 ? (
          <p className="px-space-20 py-space-16 text-admin-body-sm text-admin-ink-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-admin-hairline">
            {entries.slice(0, LIST_LIMIT).map((entry, index) => {
              const detailText = signInSummary(entry);
              return (
                <li key={`${entry.at}-${index}`} className="flex min-h-[52px] items-center gap-space-12 px-space-20 py-space-8">
                  <MaterialIcon name={icon} className="text-[18px] text-admin-ink-faint" />
                  <div className="min-w-0">
                    <time dateTime={entry.at} className="block text-admin-body-sm tabular-nums text-admin-ink">
                      {formatAbsoluteTime(entry.at)}
                    </time>
                    {detailText ? (
                      <p className="truncate text-admin-body-sm text-admin-ink-subtle">{detailText}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {entries.length > LIST_LIMIT ? (
              <li className="px-space-20 py-space-12 text-admin-body-sm text-admin-ink-subtle">
                +{entries.length - LIST_LIMIT} more
              </li>
            ) : null}
          </ul>
        )}
      </Panel>
    </section>
  );
}

export function AccountTab({
  signIns,
  appUses,
}: {
  /** Newest first. */
  signIns: readonly AdminUserRow["signIns"][number][];
  /** Newest first. */
  appUses: readonly AdminUserRow["appUses"][number][];
}) {
  return (
    <div className="grid items-start gap-space-24 lg:grid-cols-2">
      <DeviceList title="Sign-ins" icon="login" empty="No sign-ins recorded yet." entries={signIns} />
      <DeviceList title="App use" icon="devices" empty="No app use recorded yet." entries={appUses} />
    </div>
  );
}
