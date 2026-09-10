import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ausbildungsberufeFile from "@/data/ausbildungsberufe.json";
import commonFile from "@/data/ausbildung/common.json";

type StoredClip = {
  filename: string;
  script: string;
  translationVi?: string;
};

type StoredAusbildungFile = {
  clips: StoredClip[];
};

export type SessionClip = {
  id: string;
  filename: string;
  script: string;
  translationVi: string;
  audioPath: string;
};

export type Ausbildungsberuf = {
  id: string;
  label: string;
  slug: string;
};

type CatalogBeruf = {
  id: string;
  label: string;
  slug: string;
};

const catalogBerufe = ausbildungsberufeFile as CatalogBeruf[];
const ausbildungDir = join(process.cwd(), "src/data/ausbildung");

function isStoredAusbildungFile(value: unknown): value is StoredAusbildungFile {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as StoredAusbildungFile).clips)
  );
}

/**
 * Load every per-profession JSON present on disk (excludes common.json).
 * No hardcoded profession allowlist — discovery is filesystem-driven.
 */
function loadProfessionFilesFromDisk(): Record<string, StoredAusbildungFile> {
  const files: Record<string, StoredAusbildungFile> = {};
  if (!existsSync(ausbildungDir)) {
    return files;
  }

  for (const name of readdirSync(ausbildungDir)) {
    if (!name.endsWith(".json") || name === "common.json") {
      continue;
    }
    const slug = name.slice(0, -".json".length);
    const raw = readFileSync(join(ausbildungDir, name), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isStoredAusbildungFile(parsed)) {
      files[slug] = parsed;
    }
  }

  return files;
}

const professionFiles = loadProfessionFilesFromDisk();

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function toSessionClip(clip: StoredClip, folder: string): SessionClip {
  return {
    id: stripExtension(clip.filename),
    filename: clip.filename,
    script: clip.script,
    translationVi: clip.translationVi ?? "",
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

/**
 * Professions that appear in ausbildungsberufe.json AND have a real
 * src/data/ausbildung/<slug>.json with a non-empty clips array.
 */
export function getAvailableBerufe(): Ausbildungsberuf[] {
  // Re-read disk so newly added content files appear without a process restart
  // in long-lived dev servers after the module was first evaluated.
  const onDisk = loadProfessionFilesFromDisk();

  return catalogBerufe.filter((beruf) => {
    const file = onDisk[beruf.slug];
    return Boolean(file && file.clips.length > 0);
  });
}

export function getSessionClips(berufSlug: string): SessionClip[] {
  const onDisk = loadProfessionFilesFromDisk();
  const professionFile = onDisk[berufSlug] ?? professionFiles[berufSlug];
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
