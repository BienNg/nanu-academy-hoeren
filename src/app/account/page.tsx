import { AccountScreen } from "@/components/AccountScreen";
import { safeCallbackUrl } from "@/lib/auth-guard";

type AccountPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  return <AccountScreen callbackUrl={safeCallbackUrl(params.callbackUrl)} />;
}
