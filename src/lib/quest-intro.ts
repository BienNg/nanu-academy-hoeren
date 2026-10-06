/**
 * The daily quest intro: a full-screen reveal of today's quests on the first
 * app open of the learner's local day. Which day it last showed is kept per
 * learner in localStorage, so a second device shows it once more.
 */

import type { QuestProgress } from "./quests";

export function questIntroKey(userId: string): string {
  return `nanu-quest-intro:${userId}`;
}

/** Screens a learner opens the app onto. Lessons, duels in play and admin stay quiet. */
export function isQuestIntroSurface(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return true;
  const [section] = parts;
  switch (section) {
    case "duel":
    case "leaderboard":
    case "account":
      return parts.length === 1;
    case "learn":
      // Level path and Lektion hub.
      return parts.length === 2 || parts.length === 3;
    case "interview":
    case "living":
      return parts.length === 2;
    default:
      return false;
  }
}

/** Show when the intro has not shown today and at least one quest is still open. */
export function shouldShowQuestIntro(
  lastShownDay: string | null,
  today: string,
  quests: readonly QuestProgress[],
): boolean {
  if (lastShownDay === today) return false;
  return quests.length > 0 && quests.some((quest) => !quest.done);
}

/** Vietnamese greeting for the local hour (0-23). */
export function questIntroGreeting(hour: number): string {
  if (hour < 4 || hour >= 18) return "Chào buổi tối";
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 13) return "Chào buổi trưa";
  return "Chào buổi chiều";
}

