import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { recordUserSignIn } from "@/lib/progress-store";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/account",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/account" || pathname.startsWith("/account/")) {
        return true;
      }
      return !!auth;
    },
    async jwt({ token, account, profile, user }) {
      if (account) {
        // Marks when this session was issued, so a deleted account can revoke
        // older sessions while a later sign-in starts fresh.
        token.authAt = Math.floor(Date.now() / 1000);
        const userId =
          (typeof profile?.sub === "string" && profile.sub) ||
          (typeof token.sub === "string" ? token.sub : "");
        if (userId) {
          const email =
            typeof profile?.email === "string"
              ? profile.email
              : typeof user?.email === "string"
                ? user.email
                : undefined;
          const name =
            typeof profile?.name === "string"
              ? profile.name
              : typeof user?.name === "string"
                ? user.name
                : undefined;
          try {
            await recordUserSignIn(userId, {
              ...(email !== undefined ? { email } : {}),
              ...(name !== undefined ? { name } : {}),
            });
          } catch (error) {
            console.error("Failed to record sign-in", error);
          }
        }
      }
      if (user) {
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        token.picture = user.image ?? token.picture;
      }
      if (account && profile) {
        token.sub = profile.sub ?? token.sub;
        if (typeof profile.email === "string") token.email = profile.email;
        if (typeof profile.name === "string") token.name = profile.name;
        const picture = "picture" in profile ? profile.picture : undefined;
        if (typeof picture === "string") token.picture = picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.name === "string") session.user.name = token.name;
        session.user.image =
          typeof token.picture === "string" ? token.picture : null;
        session.user.authAt = token.authAt;
      }
      return session;
    },
  },
  trustHost: true,
});
