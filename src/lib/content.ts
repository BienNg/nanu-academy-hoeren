import baeckerFile from "@/data/ausbildung/baecker.json";
import commonFile from "@/data/ausbildung/common.json";
import hotelfachkraftFile from "@/data/ausbildung/hotelfachkraft.json";
import kochFile from "@/data/ausbildung/koch.json";
import metzgereiFile from "@/data/ausbildung/metzgerei.json";
import restaurantfachkraftFile from "@/data/ausbildung/restaurantfachkraft.json";

type StoredClip = {
  filename: string;
  script: string;
};

type StoredAusbildungFile = {
  clips: StoredClip[];
};

export type SessionClip = {
  id: string;
  filename: string;
  script: string;
  audioPath: string;
};

const professionFiles: Record<string, StoredAusbildungFile> = {
  baecker: baeckerFile as StoredAusbildungFile,
  hotelfachkraft: hotelfachkraftFile as StoredAusbildungFile,
  koch: kochFile as StoredAusbildungFile,
  metzgerei: metzgereiFile as StoredAusbildungFile,
  restaurantfachkraft: restaurantfachkraftFile as StoredAusbildungFile,
};

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function toSessionClip(clip: StoredClip, folder: string): SessionClip {
  return {
    id: stripExtension(clip.filename),
    filename: clip.filename,
    script: clip.script,
    audioPath: `ausbildung/${folder}/${clip.filename}`,
  };
}

function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i];
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = current as T;
  }
  return shuffled;
}

export function getSessionClips(berufSlug: string): SessionClip[] {
  const professionFile = professionFiles[berufSlug];
  if (!professionFile) {
    throw new Error(`Unknown Ausbildungsberuf slug: "${berufSlug}"`);
  }

  const commonClips = (commonFile as StoredAusbildungFile).clips.map((clip) =>
    toSessionClip(clip, "common"),
  );
  const professionClips = professionFile.clips.map((clip) =>
    toSessionClip(clip, berufSlug),
  );

  return shuffle([...commonClips, ...professionClips]);
}
