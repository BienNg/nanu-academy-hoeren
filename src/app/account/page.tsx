import { AccountScreen } from "@/components/AccountScreen";
import { safeCallbackUrl } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";

type AccountPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const berufe = getAvailableBerufe();
  const interviewClipTotals: Record<string, number> = {};
  for (const beruf of berufe) {
    interviewClipTotals[beruf.slug] = getSessionClips(beruf.slug).length;
  }

  return (
    <AccountScreen
      callbackUrl={safeCallbackUrl(params.callbackUrl)}
      interviewClipTotals={interviewClipTotals}
    />
  );
}
