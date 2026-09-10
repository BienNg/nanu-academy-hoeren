import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.name === "string") session.user.name = token.name;
        session.user.authAt = token.authAt;
      }
      return session;
    },
  },
  trustHost: true,
});
