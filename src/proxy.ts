export { auth as proxy } from "@/auth";

export const config = {
  // Skip auth for API, Next internals, and public static assets (e.g. /logo192.png).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
