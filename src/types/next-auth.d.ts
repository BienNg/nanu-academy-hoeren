import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** Unix seconds when this session was issued. */
      authAt?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    authAt?: number;
  }
}
