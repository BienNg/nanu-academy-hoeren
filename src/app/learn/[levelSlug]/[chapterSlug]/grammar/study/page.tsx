import { GrammarStudySession } from "@/components/session/grammar/GrammarStudySession";
import { loadGrammarPage, type GrammarPageProps } from "../grammar-page";

export default async function GrammarStudyPage(props: GrammarPageProps) {
  const page = await loadGrammarPage(props);
  return <GrammarStudySession key={`${page.topic.id}-${page.partNumber}`} {...page} />;
}
