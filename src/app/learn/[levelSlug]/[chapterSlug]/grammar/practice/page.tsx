import { GrammarPracticeSession } from "@/components/session/grammar/GrammarPracticeSession";
import { loadGrammarPage, type GrammarPageProps } from "../grammar-page";

export default async function GrammarPracticePage(props: GrammarPageProps) {
  const page = await loadGrammarPage(props);
  return <GrammarPracticeSession key={`${page.topic.id}-${page.partNumber}`} {...page} />;
}
