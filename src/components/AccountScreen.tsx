"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { ProfileButton } from "@/components/ProfileButton";
import { useProgress } from "@/lib/useProgress";

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

type AccountScreenProps = {
  callbackUrl: string;
  interviewClipTotals: Record<string, number>;
  isAdmin?: boolean;
};

export function AccountScreen({
  callbackUrl,
  interviewClipTotals,
  isAdmin = false,
}: AccountScreenProps) {
  const { data: session, status } = useSession();
  const { continueLearning, streakDays } = useProgress(interviewClipTotals);
  const loading = status === "loading";
  const user = session?.user;

  if (loading) {
    return (
      <main className="relative flex w-full flex-1 flex-col items-center justify-center bg-surface px-space-16">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Đang tải…
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <div 
        data-layout="wide"
        className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
      >
        <header className="sticky top-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl border-b border-black/[0.05]">
          <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                aria-label="Về trang chủ"
                className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7] active:scale-95"
              >
                <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
              </Link>
              <h1 className="font-headline-sm text-[17px] font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
                Đăng nhập
              </h1>
            </div>
          </div>
        </header>

        <main className="relative flex w-full flex-1 flex-col items-center bg-transparent">
          {/* Background decorative elements */}
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-50">
            <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[60%] rounded-full bg-blue-100/40 blur-[80px] md:-left-[5%] md:-top-[5%] md:h-[50%] md:w-[40%] md:blur-[120px]" />
            <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[60%] rounded-full bg-teal-100/30 blur-[80px] md:-bottom-[5%] md:-right-[5%] md:h-[50%] md:w-[40%] md:blur-[120px]" />
          </div>
          
          <div className="relative z-10 flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-32">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#0066cc] text-white shadow-[0_8px_30px_rgba(0,102,204,0.3)]">
                <MaterialIcon name="hearing" className="text-[40px]" />
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.02em" }}>
                  NaNu Academy<br />Hören
                </h1>
                <p className="max-w-[280px] text-lg font-medium text-[#86868b]">
                  Luyện nghe và chép chính tả tiếng Đức chuyên ngành.
                </p>
              </div>
            </div>

            <section className="flex w-full max-w-[400px] flex-col gap-6 rounded-[32px] border border-white/20 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
              <div className="flex flex-col gap-2 text-center">
                <h2 className="font-headline-sm text-[20px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
                  Bắt đầu học ngay
                </h2>
                <p className="text-[14px] font-medium text-[#86868b]">
                  Đăng nhập để lưu tiến độ và đồng bộ trên mọi thiết bị của bạn.
                </p>
              </div>
              
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl })}
                className="group relative flex h-[56px] w-full items-center justify-center gap-3 overflow-hidden rounded-[16px] bg-white border border-black/[0.05] font-label-lg text-[16px] font-semibold text-[#1d1d1f] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#f5f5f7] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] active:scale-[0.98]"
              >
                <GoogleIcon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                <span>Tiếp tục với Google</span>
              </button>
              
              <p className="text-center text-[12px] font-medium text-[#86868b]">
                Bằng việc đăng nhập, bạn đồng ý với Điều khoản và Chính sách bảo mật của chúng tôi.
              </p>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div 
      data-layout="wide"
      className="relative flex w-screen max-w-none flex-1 flex-col bg-[#fbfbfd] min-h-dvh selection:bg-[#0066cc] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <header className="sticky top-0 z-50 w-full bg-[#fbfbfd]/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-xl border-b border-black/[0.05]">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Về trang chủ"
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7] active:scale-95"
            >
              <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
            </Link>
            <h1 className="font-headline-sm text-[17px] font-bold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
              Tài khoản
            </h1>
          </div>
          <ProfileButton />
        </div>
      </header>

      <main className="relative flex w-full flex-1 flex-col items-center bg-transparent">
        {/* Background decorative elements */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-50">
          <div className="absolute -left-[20%] top-[0%] h-[30%] w-[70%] rounded-full bg-blue-100/40 blur-[100px] md:-left-[10%] md:h-[40%] md:w-[50%] md:blur-[120px]" />
        </div>
        
        <div className="relative z-10 flex w-full max-w-2xl flex-col gap-6 px-6 pb-32 pt-6">
          <section className="flex flex-col gap-5 rounded-[32px] border border-white/20 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full shadow-sm border border-black/[0.05]">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt=""
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#f5f5f7] text-[#86868b]">
                    <MaterialIcon name="person" className="text-[36px]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 flex-col justify-center gap-1">
                <h2 className="truncate font-headline-sm text-[20px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
                  {user.name ?? "Học viên NaNu"}
                </h2>
                {user.email ? (
                  <p className="truncate font-body-sm text-[14px] text-[#86868b]">
                    {user.email}
                  </p>
                ) : null}
                <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#0066cc]/10 px-2 py-0.5 border border-[#0066cc]/20">
                  <GoogleIcon className="h-3 w-3" />
                  <span className="font-caption text-[11px] font-bold uppercase tracking-wider text-[#0066cc]">
                    Đã liên kết
                  </span>
                </div>
              </div>
            </div>

            {isAdmin ? (
              <Link
                href="/admin"
                className="flex h-[48px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#e8f2fc] font-label-lg text-[15px] font-semibold text-[#0066cc] transition-all hover:bg-[#d0e5fa] active:scale-[0.98]"
              >
                <MaterialIcon name="admin_panel_settings" className="text-[20px]" />
                Admin dashboard
              </Link>
            ) : null}

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/account" })}
              className="flex h-[48px] w-full items-center justify-center gap-2 rounded-[16px] border border-black/[0.05] bg-white font-label-lg text-[15px] font-semibold text-[#ff3b30] shadow-sm transition-all hover:bg-[#fff2f2] active:scale-[0.98]"
            >
              <MaterialIcon name="logout" className="text-[20px]" />
              Đăng xuất
            </button>
          </section>

          <section className="flex flex-col gap-4 rounded-[32px] border border-white/20 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0066cc] text-white shadow-[0_2px_8px_rgba(0,102,204,0.25)]">
                <MaterialIcon name="monitoring" className="text-[22px]" />
              </div>
              <h2 className="font-headline-sm text-[18px] font-bold text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>
                Tiến độ học
              </h2>
            </div>
            
            <div className="flex flex-col gap-3 rounded-[20px] bg-[#f5f5f7]/80 p-4 border border-black/[0.05]">
              <div className="flex items-center justify-between border-b border-black/[0.05] pb-3">
                <div className="flex items-center gap-2 text-[#86868b]">
                  <MaterialIcon name="local_fire_department" className="text-[18px] text-[#0066cc]" filled />
                  <span className="font-body-sm text-[14px] font-medium">Chuỗi ngày luyện</span>
                </div>
                <span className="font-label-lg text-[15px] font-bold text-[#1d1d1f]">
                  {streakDays} ngày
                </span>
              </div>
              
              <div className="flex items-center justify-between border-b border-black/[0.05] pb-3">
                <div className="flex items-center gap-2 text-[#86868b]">
                  <MaterialIcon name="task_alt" className="text-[18px] text-[#0066cc]" filled />
                  <span className="font-body-sm text-[14px] font-medium">Đã hoàn thành</span>
                </div>
                <span className="font-label-lg text-[15px] font-bold text-[#1d1d1f]">
                  {continueLearning.completedCount} / {Math.max(continueLearning.totalClips, 1)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#86868b]">
                  <MaterialIcon name="cloud_sync" className="text-[18px] text-[#0066cc]" filled />
                  <span className="font-body-sm text-[14px] font-medium">Đồng bộ đám mây</span>
                </div>
                <span className="font-label-lg text-[13px] font-bold text-[#0066cc]">
                  Đang bật
                </span>
              </div>
            </div>
            
            <Link
              href={continueLearning.href}
              className="group mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#0066cc] font-label-lg text-[16px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] hover:-translate-y-0.5 active:scale-[0.98]"
            >
              Tiếp tục luyện
              <MaterialIcon name="arrow_forward" className="text-[18px] transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
