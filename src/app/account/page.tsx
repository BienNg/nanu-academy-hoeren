import { AccountScreen } from "@/components/AccountScreen";
import { isAdminUser } from "@/lib/admins";
import { auth } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth-guard";

type AccountPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const session = await auth();

  return (
    <AccountScreen
      callbackUrl={safeCallbackUrl(params.callbackUrl)}
      isAdmin={session?.user ? isAdminUser(session.user) : false}
    />
  );
}
