/** Evening streak reminder. One send per local day, then a pause after ignored ones. */

export const REMINDER_ZONE = "Asia/Ho_Chi_Minh";
export const IGNORE_BEFORE_PAUSE = 3;
export const PAUSE_DAYS = 14;

export type ReminderState = {
  lastSentOn: string | null;
  /** The send whose outcome is already in `ignoredCount`. */
  judgedOn: string | null;
  ignoredCount: number;
  pausedUntil: string | null;
};

export function emptyReminderState(): ReminderState {
  return { lastSentOn: null, judgedOn: null, ignoredCount: 0, pausedUntil: null };
}

export function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sameState(left: ReminderState, right: ReminderState): boolean {
  return (
    left.lastSentOn === right.lastSentOn &&
    left.judgedOn === right.judgedOn &&
    left.ignoredCount === right.ignoredCount &&
    left.pausedUntil === right.pausedUntil
  );
}

/** Fold a previous send into the ignore count once that calendar day is over. */
export function judgeReminder(
  state: ReminderState,
  today: string,
  practicedOn: (day: string) => boolean,
): ReminderState {
  if (!state.lastSentOn || state.lastSentOn >= today || state.judgedOn === state.lastSentOn) {
    return state;
  }
  if (practicedOn(state.lastSentOn)) {
    return { ...state, judgedOn: state.lastSentOn, ignoredCount: 0 };
  }
  const ignoredCount = state.ignoredCount + 1;
  if (ignoredCount >= IGNORE_BEFORE_PAUSE) {
    return {
      ...state,
      judgedOn: state.lastSentOn,
      ignoredCount: 0,
      pausedUntil: shiftIsoDate(today, PAUSE_DAYS),
    };
  }
  return { ...state, judgedOn: state.lastSentOn, ignoredCount };
}

export function shouldSendStreakReminder(input: {
  state: ReminderState;
  today: string;
  streakDays: number;
  practicedToday: boolean;
}): boolean {
  const { state, today, streakDays, practicedToday } = input;
  if (practicedToday || streakDays < 1) return false;
  if (state.pausedUntil && today < state.pausedUntil) return false;
  if (state.lastSentOn === today) return false;
  return true;
}

export function planStreakReminder(input: {
  state: ReminderState;
  today: string;
  streakDays: number;
  practicedToday: boolean;
  practicedOn: (day: string) => boolean;
}): { send: boolean; next: ReminderState; changed: boolean } {
  const judged = judgeReminder(input.state, input.today, input.practicedOn);
  const send = shouldSendStreakReminder({ ...input, state: judged });
  const next = send ? { ...judged, lastSentOn: input.today } : judged;
  return { send, next, changed: send || !sameState(input.state, next) };
}

export function streakReminderCopy(streakDays: number): { title: string; body: string; url: string } {
  const days = Math.max(1, Math.floor(streakDays));
  return {
    title: `Chuỗi ${days} ngày sắp mất`,
    body: "Một phần nữa là giữ được.",
    url: "/",
  };
}
