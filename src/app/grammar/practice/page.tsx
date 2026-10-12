import { notFound } from "next/navigation";
import { GrammarWorldSession } from "@/components/grammar-world/GrammarWorldSession";
import { requireUser } from "@/lib/auth-guard";
import { loadGrammarWorld } from "@/lib/grammar-world-content";

type GrammarWorldPracticeProps = {
  searchParams: Promise<{
    topic?: string | string[];
    node?: string | string[];
    part?: string | string[];
    review?: string | string[];
    from?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positive(value: string | undefined): number {
  const number = Number(value ?? "1");
  return Number.isInteger(number) && number >= 1 ? number : 1;
}

/** `?topic=&node=&part=` plays one part of a node; `?topic=&review=1` plays the stage's review. */
export default async function GrammarWorldPracticePage({ searchParams }: GrammarWorldPracticeProps) {
  const session = await requireUser();
  const query = await searchParams;
  const data = await loadGrammarWorld(session.user);
  const topicId = first(query.topic);
  const area = data.areas.find((entry) => entry.topics.some((topic) => topic.id === topicId));
  const topic = area?.topics.find((entry) => entry.id === topicId);
  const gate = topic ? data.gates[topic.id] : undefined;
  if (!area || !topic || !gate?.access) notFound();
  const review = first(query.review) === "1";
  // Only a path inside the app, so `from` cannot send the learner elsewhere.
  const from = first(query.from);
  const returnHref = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const node = positive(first(query.node));
  const part = positive(first(query.part));
  return (
    <GrammarWorldSession
      key={review ? `${topic.id}-review` : `${topic.id}-${node}-${part}`}
      topic={topic}
      gate={gate}
      areaId={area.id}
      tables={data.tables}
      node={node}
      part={part}
      review={review}
      returnHref={returnHref}
    />
  );
}
