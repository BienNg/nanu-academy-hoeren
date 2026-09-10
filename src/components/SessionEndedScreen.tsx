"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { clearStoredProgress } from "@/lib/progress";

export function SessionEndedScreen() {
  useEffect(() => {
    clearStoredProgress(window.localStorage);
    window.dispatchEvent(new Event("nanu-horen-progress"));
    void signOut({ callbackUrl: "/account" });
  }, []);

  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center gap-space-16 px-space-24 py-space-32 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-outline">
        <span className="material-symbols-outlined text-[28px]" aria-hidden="true">
          logout
        </span>
      </div>
      <div className="flex max-w-md flex-col gap-space-8">
        <h1 className="font-headline-md text-headline-md text-on-surface">
          Tài khoản đã bị xoá
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Tiến độ trên thiết bị này đã được xoá. Bạn có thể đăng nhập lại để bắt
          đầu từ đầu.
        </p>
      </div>
    </main>
  );
}
