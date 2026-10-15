import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { TEACHER_ROUTE_PREFIX, isSharedAppPath, isTeacherHost, teacherOrigin } from "@/lib/teacher-host";

function isTeacherRoute(pathname: string): boolean {
  return pathname === TEACHER_ROUTE_PREFIX || pathname.startsWith(`${TEACHER_ROUTE_PREFIX}/`);
}

function withoutTeacherPrefix(pathname: string): string {
  return pathname.slice(TEACHER_ROUTE_PREFIX.length) || "/";
}

/**
 * Learner host: Auth.js sends signed-out visitors to /account (see `authorized`
 * in src/auth.ts), and /teacher/... moves to the teacher host.
 * Teacher host: every path is served from src/app/teacher, and signed-out
 * visitors go to /login. Pages there check the teacher role themselves.
 */
export const proxy = auth((request) => {
  const host = request.headers.get("host");
  const { pathname } = request.nextUrl;

  if (!isTeacherHost(host)) {
    if (!isTeacherRoute(pathname) || !host) return NextResponse.next();
    const target = new URL(withoutTeacherPrefix(pathname), teacherOrigin(request.nextUrl.protocol, host));
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target);
  }

  if (isTeacherRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = withoutTeacherPrefix(pathname);
    return NextResponse.redirect(url);
  }
  if (isSharedAppPath(pathname)) return NextResponse.next();
  if (!request.auth && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const url = request.nextUrl.clone();
  url.pathname = `${TEACHER_ROUTE_PREFIX}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
});

export const config = {
  // Skip auth for API, Next internals, and public static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
