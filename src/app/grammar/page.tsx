import { GrammarWorldClient } from "@/components/grammar-world/GrammarWorldClient";
import { requireUser } from "@/lib/auth-guard";
import { loadGrammarWorld } from "@/lib/grammar-world-content";

type GrammarWorldPageProps = {
  searchParams: Promise<{ tab?: string | string[]; from?: string | string[]; lit?: string | string[]; intro?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Only a path inside the app, so `from` cannot send the back button elsewhere. */
function backHref(from: string | null): string {
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

export default async function GrammarWorldPage({ searchParams }: GrammarWorldPageProps) {
  const session = await requireUser();
  const query = await searchParams;
  const data = await loadGrammarWorld(session.user);
  return (
    <GrammarWorldClient
      data={data}
      initialTab={first(query.tab)}
      backHref={backHref(first(query.from))}
      lit={first(query.lit)}
      intro={first(query.intro)}
    />
  );
}
