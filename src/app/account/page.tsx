import { AccountScreen } from "@/components/AccountScreen";
import { isAdminUser } from "@/lib/admins";
import { auth } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth-guard";
import { getUserStaff } from "@/lib/progress-store";

type AccountPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const session = await auth();
  const canOpenAdmin = session?.user
    ? isAdminUser(session.user) ||
      (session.user.id ? await getUserStaff(session.user.id) : false)
    : false;

  return (
    <AccountScreen
      callbackUrl={safeCallbackUrl(params.callbackUrl)}
      isAdmin={canOpenAdmin}
    />
  );
}
