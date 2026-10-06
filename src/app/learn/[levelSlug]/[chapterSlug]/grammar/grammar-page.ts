import { notFound } from "next/navigation";
import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import { getCefrLevel, getChapterGrammar, getGrammarTenses, getLevelChapters } from "@/lib/levels";
import { levelSessionCourse } from "@/lib/session-course";

export type GrammarPageProps = {
  params: Promise<{ levelSlug: string; chapterSlug: string }>;
  searchParams: Promise<{ topic?: string | string[]; part?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * What a grammar study or practice page needs: the Lektion, the topic named
 * by `?topic=` (the first one when missing) and the 1-based `?part=`.
 */
export async function loadGrammarPage({ params, searchParams }: GrammarPageProps) {
  const session = await requireUser();
  const { levelSlug, chapterSlug } = await params;
  const query = await searchParams;

  const level = getCefrLevel(levelSlug);
  if (!level) notFound();
  await requireLevelAccess(session.user, levelSlug);
  const chapter = getLevelChapters(levelSlug).find((entry) => entry.slug === chapterSlug);
  if (!chapter) notFound();

  const topics = getChapterGrammar(levelSlug, chapterSlug);
  const topicId = first(query.topic);
  const topic = topicId ? topics.find((entry) => entry.id === topicId) : topics[0];
  if (!topic) notFound();

  const part = Number(first(query.part) ?? "1");
  return {
    course: levelSessionCourse(level, chapter),
    topic,
    tables: getGrammarTenses(),
    partNumber: Number.isInteger(part) && part >= 1 ? part : 1,
    grammarHref: `/learn/${levelSlug}/${chapterSlug}/grammar`,
  };
}
