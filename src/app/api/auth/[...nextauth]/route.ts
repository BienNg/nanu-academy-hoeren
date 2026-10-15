import { NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Auth.js builds its callback and redirect URLs from `request.url`. The Next
 * dev server reports `localhost` there even when the browser asked for
 * `teacher.localhost`, so the OAuth callback landed on a host without the
 * sign-in cookies ("Server error"). Rebuild the URL from the Host header,
 * which Auth.js already trusts (`trustHost`). Vercel sends the real host in
 * both, so this changes nothing there.
 */
function withRequestHost(request: NextRequest): NextRequest {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || request.nextUrl.host === host) return request;
  const url = new URL(request.url);
  url.host = host;
  return new NextRequest(url, request);
}

export function GET(request: NextRequest) {
  return handlers.GET(withRequestHost(request));
}

export function POST(request: NextRequest) {
  return handlers.POST(withRequestHost(request));
}
