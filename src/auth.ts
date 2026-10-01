import { headers } from "next/headers";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { signInContextFromHeaders, type SignInContext } from "@/lib/progress";
import { googleProfileImage } from "@/lib/xp";
import { recordUserSignIn, rememberUserImage } from "@/lib/progress-store";

const EMPTY_SIGN_IN_CONTEXT: SignInContext = {
  device: null,
  browser: null,
  location: null,
};

async function readSignInContext(): Promise<SignInContext> {
  try {
    return signInContextFromHeaders(await headers());
  } catch (error) {
    console.error("Failed to read sign-in context", error);
    return EMPTY_SIGN_IN_CONTEXT;
  }
}

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
      const userId =
        (typeof profile?.sub === "string" && profile.sub) ||
        (typeof token.sub === "string" ? token.sub : "");
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
      const picture =
        googleProfileImage(user?.image) ??
        googleProfileImage(
          profile && "picture" in profile ? profile.picture : undefined,
        ) ??
        googleProfileImage(token.picture);

      if (user) {
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
      }
      if (picture && token.picture !== picture) token.picture = picture;
      if (account && profile) {
        token.sub = profile.sub ?? token.sub;
        if (typeof profile.email === "string") token.email = profile.email;
        if (typeof profile.name === "string") token.name = profile.name;
      }

      if (account) {
        // Marks when this session was issued, so a deleted account can revoke
        // older sessions while a later sign-in starts fresh.
        token.authAt = Math.floor(Date.now() / 1000);
        if (userId) {
          try {
            const imageSaved = await recordUserSignIn(
              userId,
              {
                ...(email !== undefined ? { email } : {}),
                ...(name !== undefined ? { name } : {}),
                ...(picture ? { image: picture } : {}),
              },
              new Date(),
              await readSignInContext(),
            );
            if (picture && imageSaved) token.imageStored = picture;
          } catch (error) {
            console.error("Failed to record sign-in", error);
          }
        }
      } else if (userId && picture && token.imageStored !== picture) {
        // Already-registered sessions keep the photo on the token. Save it once.
        try {
          const saved = await rememberUserImage(userId, picture);
          if (saved) token.imageStored = picture;
        } catch (error) {
          console.error("Failed to save profile image", error);
        }
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
