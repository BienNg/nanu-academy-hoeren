"use client";

import { useEffect, useState } from "react";
import { loadAdminStudentOnboarding, resetAdminStudentOnboarding } from "@/app/admin/actions";
import { MaterialIcon } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/AdminUi";
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

type OnboardingView =
  | { state: "loading" }
  | { state: "error"; error: string }
  | { state: "ready"; completedAt: string | null; resetAt: string | null };

/** Whether the learner finished the first-run map tour, with a reset that shows it again. */
function OnboardingSection({ userId }: { userId: string }) {
  const [view, setView] = useState<OnboardingView>({ state: "loading" });
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAdminStudentOnboarding(userId).then((result) => {
      if (cancelled) return;
      setView(result.ok ? { state: "ready", ...result } : { state: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function reset() {
    if (resetting) return;
    setResetting(true);
    setResetError(null);
    const result = await resetAdminStudentOnboarding(userId);
    setResetting(false);
    if (!result.ok) {
      setResetError(result.error);
      return;
    }
    setView({ state: "ready", completedAt: result.completedAt, resetAt: result.resetAt });
  }

  const completed = view.state === "ready" && view.completedAt !== null;
  let status: string;
  if (view.state === "loading") status = "Loading…";
  else if (view.state === "error") status = view.error;
  else if (view.completedAt) status = `Completed ${formatAbsoluteTime(view.completedAt)}`;
  else if (view.resetAt) {
    status = `Reset ${formatAbsoluteTime(view.resetAt)}. The tour shows on their next course map visit.`;
  } else status = "Not completed. The tour shows on their next course map visit.";

  return (
    <section aria-label="Onboarding" className="flex flex-col gap-space-12">
      <ColumnHeader title="Onboarding" description="The first-run tour of the course map." />
      <Panel>
        <div className="flex flex-wrap items-center gap-space-12 px-space-20 py-space-16">
          <MaterialIcon
            name={completed ? "check_circle" : "tour"}
            className={`text-[18px] ${completed ? "text-admin-cobalt" : "text-admin-ink-faint"}`}
          />
          <p className="min-w-0 flex-1 text-admin-body-sm text-admin-ink">{status}</p>
          <Button icon="restart_alt" disabled={!completed || resetting} onClick={reset}>
            {resetting ? "Resetting…" : "Reset onboarding"}
          </Button>
        </div>
        {resetError ? (
          <p
            role="alert"
            className="border-t border-admin-hairline px-space-20 py-space-12 text-admin-body-sm text-admin-crimson-ink"
          >
            {resetError}
          </p>
        ) : null}
      </Panel>
    </section>
  );
}

export function AccountTab({
  userId,
  signIns,
  appUses,
  onRequestClear,
}: {
  userId: string;
  /** Newest first. */
  signIns: readonly AdminUserRow["signIns"][number][];
  /** Newest first. */
  appUses: readonly AdminUserRow["appUses"][number][];
  /** Owners only. Omitted hides the clear button. */
  onRequestClear?: () => void;
}) {
  return (
    <div className="flex flex-col gap-space-16">
      {onRequestClear ? (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            icon="delete"
            disabled={signIns.length === 0 && appUses.length === 0}
            onClick={onRequestClear}
          >
            Clear sign-in history
          </Button>
        </div>
      ) : null}
      <OnboardingSection userId={userId} />
      <div className="grid items-start gap-space-24 lg:grid-cols-2">
        <DeviceList title="Sign-ins" icon="login" empty="No sign-ins recorded yet." entries={signIns} />
        <DeviceList title="App use" icon="devices" empty="No app use recorded yet." entries={appUses} />
      </div>
    </div>
  );
}
