"use client";

import { useEffect, useRef, useState } from "react";
import type { Howl } from "howler";
import type { SessionClip } from "@/lib/content";
import { createClipHowl, resolveAudioUrl } from "@/lib/audio";

type StudyClipListProps = {
  clips: SessionClip[];
  /** "tips" is the Duolingo speech-bubble list used on the vocabulary sheet. */
  variant?: "rows" | "tips";
  /**
   * Clip ids the learner may play. Others stay in the list, grey and inert.
   * Omit it when every clip should play.
   */
  playableIds?: ReadonlySet<string>;
};

export function StudyClipList({ clips, variant = "rows", playableIds }: StudyClipListProps) {
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

  if (variant === "tips") {
    return (
      <ul className="flex flex-col items-start gap-3">
        {clips.map((clip) => {
          const isPlaying = playingId === clip.id;
          const locked = playableIds != null && !playableIds.has(clip.id);
          return (
            <li key={clip.id} className="max-w-full">
              <button
                type="button"
                disabled={locked}
                onClick={() => playClip(clip)}
                aria-label={
                  locked
                    ? `${clip.script}, chưa học`
                    : isPlaying
                      ? `Tạm dừng ${clip.script}`
                      : `Phát ${clip.script}`
                }
                className={`flex max-w-full items-start gap-2.5 rounded-2xl border-2 px-3.5 py-3 text-left ${
                  locked
                    ? "cursor-default border-[#e5e5e5] bg-[#f7f7f7] shadow-[0_2px_0_0_#e5e5e5]"
                    : `bg-white transition-transform active:translate-y-0.5 ${
                        isPlaying
                          ? "border-[#1cb0f6] shadow-[0_2px_0_0_#1cb0f6]"
                          : "border-[#e5e5e5] shadow-[0_2px_0_0_#e5e5e5]"
                      }`
                }`}
              >
                <span
                  className={`material-symbols-outlined mt-0.5 shrink-0 text-[22px] ${
                    locked ? "text-[#c8c8c8]" : "text-[#1cb0f6]"
                  }`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                  aria-hidden="true"
                >
                  {isPlaying && !locked ? "pause" : "volume_up"}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={`text-[17px] font-bold leading-snug ${
                      locked ? "text-[#afafaf]" : "text-[#3c3c3c]"
                    }`}
                  >
                    {clip.script}
                  </span>
                  {clip.translationVi ? (
                    <span className="text-[15px] leading-snug text-[#afafaf]">{clip.translationVi}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

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
