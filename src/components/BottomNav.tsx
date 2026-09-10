"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: (props: { className?: string }) => ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Trang chủ",
    match: (pathname) => pathname === "/",
    icon: HomeIcon,
  },
  {
    href: "/practice",
    label: "Luyện tập",
    match: (pathname) =>
      pathname === "/practice" ||
      pathname.startsWith("/practice/") ||
      pathname.startsWith("/learn/") ||
      pathname.startsWith("/interview/"),
    icon: PracticeIcon,
  },
  {
    href: "/progress",
    label: "Tiến trình",
    match: (pathname) =>
      pathname === "/progress" || pathname.startsWith("/progress/"),
    icon: ProgressIcon,
  },
  {
    href: "/account",
    label: "Tài khoản",
    match: (pathname) =>
      pathname === "/account" || pathname.startsWith("/account/"),
    icon: AccountIcon,
  },
];

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 9.5 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function PracticeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ProgressIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

function BottomNavBar({ pathname }: { pathname: string }) {
  return (
    <nav
      className="fixed bottom-0 z-50 w-full bg-surface/85 pb-safe shadow-[0_-2px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl"
      aria-label="Điều hướng chính"
    >
      <div className="flex h-16 items-center justify-around px-space-8 md:mx-auto md:max-w-[680px]">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-space-2 transition-colors ${
                active
                  ? "font-medium text-primary-container"
                  : "text-nav-inactive hover:text-on-surface"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              <span
                className={
                  active
                    ? "font-caption text-caption font-semibold leading-none"
                    : "font-caption text-caption leading-none"
                }
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNavFallback() {
  return <BottomNavBar pathname="/" />;
}

export function BottomNav() {
  const pathname = usePathname();
  return <BottomNavBar pathname={pathname} />;
}
