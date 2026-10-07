import { GrammarPracticeSession } from "@/components/session/grammar/GrammarPracticeSession";
import { GrammarStudySession } from "@/components/session/grammar/GrammarStudySession";
import { loadGrammarPage, type GrammarPageProps } from "../grammar-page";

export default async function GrammarPracticePage(props: GrammarPageProps) {
  const page = await loadGrammarPage(props);
  const key = `${page.topic.id}-${page.partNumber}`;
  if (page.topic.practice.length > 0) {
    return <GrammarStudySession key={key} node="practice" {...page} />;
  }
  return <GrammarPracticeSession key={key} {...page} />;
}
