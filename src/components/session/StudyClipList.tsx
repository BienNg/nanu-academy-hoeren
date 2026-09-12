"use client";

import { useEffect, useRef, useState } from "react";
import type { Howl } from "howler";
import type { SessionClip } from "@/lib/content";
import { createClipHowl, resolveAudioUrl } from "@/lib/audio";

type StudyClipListProps = {
  clips: SessionClip[];
};

export function StudyClipList({ clips }: StudyClipListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const howlRef = useRef<Howl | null>(null);

  useEffect(() => {
    return () => {
      howlRef.current?.unload();
      howlRef.current = null;
    };
  }, []);

  const playClip = (clip: SessionClip) => {
    if (playingId === clip.id) {
      howlRef.current?.stop();
      howlRef.current?.unload();
      howlRef.current = null;
      setPlayingId(null);
      return;
    }

    howlRef.current?.unload();
    const howl = createClipHowl(resolveAudioUrl(clip.audioPath), 1, {
      onEnd: () => setPlayingId(null),
    });
    howlRef.current = howl;
    setPlayingId(clip.id);
    howl.play();
  };

  return (
    <ul className="overflow-hidden rounded-[24px] border border-white/20 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
      {clips.map((clip, index) => {
        const isPlaying = playingId === clip.id;
        return (
          <li
            key={clip.id}
            className={
              index < clips.length - 1 ? "border-b border-black/[0.05]" : undefined
            }
          >
            <button
              type="button"
              onClick={() => playClip(clip)}
              aria-label={isPlaying ? `Tạm dừng ${clip.script}` : `Phát ${clip.script}`}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#f5f5f7]/70 active:bg-[#f5f5f7]"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isPlaying
                    ? "bg-[#0066cc] text-white"
                    : "bg-[#f5f5f7] text-[#0066cc]"
                }`}
              >
                <span
                  className={`material-symbols-outlined ${
                    isPlaying ? "text-[20px]" : "ml-0.5 text-[20px]"
                  }`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  {isPlaying ? "pause" : "play_arrow"}
                </span>
              </span>
              <span className="min-w-0 flex-1 text-[16px] font-medium leading-snug text-[#1d1d1f]">
                {clip.script}
              </span>
              {clip.translationVi ? (
                <span className="min-w-0 max-w-[46%] text-right text-[14px] italic leading-snug text-[#86868b]">
                  {clip.translationVi}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
