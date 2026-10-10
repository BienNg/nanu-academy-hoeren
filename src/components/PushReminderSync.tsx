"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { refreshPushSubscription, releasePushSubscription } from "@/lib/push-client";

/** Resubscribe while signed in. Drop the browser subscription once the session is gone. */
export function PushReminderSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") void refreshPushSubscription();
    if (status === "unauthenticated") void releasePushSubscription();
  }, [status]);

  return null;
}
