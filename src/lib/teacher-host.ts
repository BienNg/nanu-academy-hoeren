/**
 * The teacher site (docs/SESSION_RATINGS.md, Part 6) is this same app on the
 * `teacher.` subdomain: teacher.nanugo.app, or teacher.localhost:3000 in
 * development. The proxy rewrites its paths to `/teacher/...`, so pages and
 * links there use the visible paths ("/", "/g126", "/login").
 */

export const TEACHER_HOST_PREFIX = "teacher.";

/** Where teacher pages live in `src/app`. */
export const TEACHER_ROUTE_PREFIX = "/teacher";

export function isTeacherHost(host: string | null | undefined): boolean {
  return Boolean(host && host.trim().toLowerCase().startsWith(TEACHER_HOST_PREFIX));
}

/** "https://teacher.nanugo.app" from the learner host "www.nanugo.app" or "nanugo.app". */
export function teacherOrigin(protocol: string, host: string): string {
  const bare = host.replace(/^www\./i, "");
  return `${protocol.replace(/:?$/, ":")}//${TEACHER_HOST_PREFIX}${bare}`;
}

/** Files every host serves as they are: icons, manifest, share images. */
export function isSharedAppPath(pathname: string): boolean {
  return (
    pathname === "/opengraph-image" ||
    pathname.startsWith("/opengraph-image/") ||
    pathname === "/icon" ||
    pathname.startsWith("/icon/") ||
    /^\/icon\d+(\/|$)/.test(pathname) ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/apple-icon/") ||
    pathname === "/manifest.webmanifest"
  );
}
