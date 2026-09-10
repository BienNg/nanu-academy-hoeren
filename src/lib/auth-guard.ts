import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Allow only same-origin relative paths after Google sign-in. */
export function safeCallbackUrl(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/";

  let path = raw;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const url = new URL(raw);
      path = `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return "/";
  }

  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return "/";
  }
  if (
    path === "/account" ||
    path.startsWith("/account/") ||
    path.startsWith("/account?")
  ) {
    return "/";
  }
  return path;
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/account");
  }
  return session;
}
