"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { ProfileButton } from "@/components/ProfileButton";
import type { CefrLevel, ChapterVideo, LevelChapterMeta } from "@/lib/levels";
import {
  lessonVideoProgressKey,
  lessonVideoStatus,
  videoPlayedSeconds,
  type LessonVideoProgress,
  type LessonVideoStatus,
} from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";
import {
  loadYouTubeIframeApi,
  supportsProgrammaticVolume,
  YT_CUED,
  YT_ENDED,
  YT_PAUSED,
  YT_PLAYING,
  YT_UNSTARTED,
  type YouTubePlayer,
} from "@/lib/youtube";

type NextLessonCard = {
  href: string;
  label: string;
};

type VideoLessonCardProps = {
  levelSlug: string;
  chapterSlug: string;
  videos: ChapterVideo[];
  /** `page` is the full lesson video screen. `card` keeps the hub tile. */
  presentation?: "card" | "page";
  initialVideoId?: string | null;
  /** Path card that follows this video. Shown once the video is marked watched. */
  nextCard?: NextLessonCard | null;
};

export const LESSON_VIDEO_STATUS_LABEL: Record<LessonVideoStatus, string> = {
  "not-started": "Chưa xem",
  "in-progress": "Đang xem",
  watched: "Đã xem",
};

function firstUncompletedVideoIndex(
  videos: readonly ChapterVideo[],
  levelSlug: string,
  chapterSlug: string,
  lessonVideoProgressFor: (key: string) => LessonVideoProgress | undefined,
): number | null {
  const index = videos.findIndex((item) => {
    if (!item.videoId) return false;
    const key = lessonVideoProgressKey(levelSlug, chapterSlug, item.videoId);
    return lessonVideoStatus(lessonVideoProgressFor(key)) !== "watched";
  });
  return index === -1 ? null : index;
}

const MARK_WATCHED_LEAD_SECONDS = 10;
const FULLSCREEN_CONTROLS_HIDE_MS = 2000;

/** Shifts the embed so YouTube's title and Share / Save sit outside the clip. */
const YOUTUBE_CHROME_CROP_PX = 60;

const VIDEO_QUALITY_STORAGE_KEY = "nanu-video-quality";
const VIDEO_SPEED_STORAGE_KEY = "nanu-video-speed";

/** Rates the embedded player can actually apply. */
const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * YouTube ignores setPlaybackQuality. It chooses the stream from the iframe's
 * layout size, so each option renders the embed at a size that selects that
 * stream, then scales it into the visible frame.
 * Measured against the embedded player: 1920-wide → 1080p, 640-wide → 720p,
 * 426-wide → 360p.
 */
const QUALITY_FRAME: Record<string, { width: number; height: number }> = {
  highres: { width: 3840, height: 2160 },
  hd2160: { width: 3840, height: 2160 },
  hd1440: { width: 2560, height: 1440 },
  hd1080: { width: 1920, height: 1080 },
  hd720: { width: 640, height: 360 },
  large: { width: 500, height: 281 },
  medium: { width: 426, height: 240 },
};

const QUALITY_RANK = [
  "highres",
  "hd2160",
  "hd1440",
  "hd1080",
  "hd720",
  "large",
  "medium",
];

const QUALITY_LABEL: Record<string, string> = {
  auto: "Tự động",
  highres: "4K",
  hd2160: "2160p",
  hd1440: "1440p",
  hd1080: "1080p",
  hd720: "720p",
  large: "480p",
  medium: "360p",
};

function readStoredVideoQuality(): string {
  if (typeof window === "undefined") return "auto";
  try {
    const value = window.localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY);
    if (value === "auto" || (value != null && QUALITY_FRAME[value])) return value;
  } catch {
    // Private mode can reject storage reads.
  }
  return "auto";
}

function storeVideoQuality(value: string) {
  try {
    window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures; the choice still applies for this view.
  }
}

function isVideoSpeed(value: number): value is (typeof VIDEO_SPEEDS)[number] {
  return (VIDEO_SPEEDS as readonly number[]).includes(value);
}

function readStoredVideoSpeed(): number {
  if (typeof window === "undefined") return 1;
  try {
    const value = Number(window.localStorage.getItem(VIDEO_SPEED_STORAGE_KEY));
    if (isVideoSpeed(value)) return value;
  } catch {
    // Private mode can reject storage reads.
  }
  return 1;
}

function storeVideoSpeed(value: number) {
  try {
    window.localStorage.setItem(VIDEO_SPEED_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures; the choice still applies for this view.
  }
}

function formatVideoSpeed(rate: number): string {
  return `${rate}x`;
}

function applyPlaybackRate(player: YouTubePlayer, rate: number) {
  try {
    if (Math.abs(player.getPlaybackRate() - rate) < 0.01) return;
    player.setPlaybackRate(rate);
  } catch {
    // Playback rate is unavailable until the player finishes loading.
  }
}

function currentFullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function enterFullscreen(element: HTMLElement) {
  const target = element as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (typeof element.requestFullscreen === "function") {
    return Promise.resolve(element.requestFullscreen()).catch(() => {});
  }
  target.webkitRequestFullscreen?.();
}

function leaveFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => void };
  if (document.fullscreenElement) {
    return Promise.resolve(document.exitFullscreen()).catch(() => {});
  }
  doc.webkitExitFullscreen?.();
}

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function readTime(player: YouTubePlayer): number {
  try {
    const time = player.getCurrentTime();
    return Number.isFinite(time) ? Math.max(0, time) : 0;
  } catch {
    return 0;
  }
}

function useProgrammaticVolume(): boolean {
  return useSyncExternalStore(
    () => () => {},
    supportsProgrammaticVolume,
    () => true,
  );
}

function readDuration(player: YouTubePlayer): number {
  try {
    const duration = player.getDuration();
    return Number.isFinite(duration) ? Math.max(0, duration) : 0;
  } catch {
    return 0;
  }
}

function VerticalVolumeSlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  function valueFromClientY(clientY: number) {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const ratio = (rect.bottom - clientY) / rect.height;
    return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(valueFromClientY(event.clientY));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onChange(valueFromClientY(event.clientY));
  }

  function nudge(delta: number) {
    onChange(Math.min(100, Math.max(0, value + delta)));
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Âm lượng"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "ArrowUp" || event.key === "ArrowRight") {
          event.preventDefault();
          nudge(5);
        } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
          event.preventDefault();
          nudge(-5);
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(100);
        }
      }}
      className="relative flex h-28 w-8 cursor-pointer touch-none items-center justify-center outline-none disabled:cursor-not-allowed"
    >
      <div className="relative h-full w-1.5 rounded-full bg-[#e8e8ed]">
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-[#0066cc]"
          style={{ height: `${value}%` }}
        />
        <div
          className="absolute left-1/2 h-[18px] w-[18px] -translate-x-1/2 translate-y-1/2 rounded-full bg-[#0066cc] shadow-[0_1px_4px_rgb(0,0,0,0.25)]"
          style={{ bottom: `${value}%` }}
        />
      </div>
    </div>
  );
}

function VideoError({ message }: { message: string }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-[16px] bg-[#f5f5f7] px-6 text-center">
      <MaterialIcon name="error" className="text-[32px] text-[#86868b]" />
      <p className="max-w-sm text-[15px] font-medium leading-relaxed text-[#86868b]">
        {message}
      </p>
    </div>
  );
}

function YouTubePane({
  videoId,
  title,
  savedPosition,
  urlStart,
  progressKey,
  variant = "card",
  nextCard = null,
}: {
  videoId: string;
  title: string;
  savedPosition: number;
  urlStart: number;
  progressKey: string;
  variant?: "card" | "page";
  nextCard?: NextLessonCard | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const saveRef = useRef<
    (
      key: string,
      positionSeconds: number,
      force?: boolean,
      playback?: {
        addSeconds?: number;
        title?: string;
        durationSeconds?: number;
      },
    ) => void
  >(() => {});
  const savedRef = useRef(savedPosition);
  const urlStartRef = useRef(urlStart);
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const userStartedRef = useRef(false);
  const userPausedRef = useRef(false);
  const autoplayAttemptedRef = useRef(false);
  const autoplayHeardRef = useRef(false);
  const autoplayMuteTimerRef = useRef<number | null>(null);
  /** After the ending is reached, later saves keep the resume spot at 0. */
  const pinResumeAtStartRef = useRef(false);
  const lastPeriodicSaveRef = useRef(0);
  const samplePositionRef = useRef<number | null>(null);
  const pendingPlayedRef = useRef(0);
  const titleRef = useRef(title);
  const durationRef = useRef(0);
  const { saveVideoPosition, setVideoWatched, lessonVideoProgressFor, progressReady } =
    useProgress();
  const entry = lessonVideoProgressFor(progressKey);
  const watched = Boolean(entry?.watchedAt);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const volumeSupported = useProgrammaticVolume();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsHeld, setControlsHeld] = useState(false);
  const [controlsEpoch, setControlsEpoch] = useState(0);
  const [prefsReady, setPrefsReady] = useState(false);
  const [quality, setQuality] = useState("auto");
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<string[]>([]);
  const [actualQuality, setActualQuality] = useState("");
  const qualityRef = useRef("auto");
  const qualityControlRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [availableSpeeds, setAvailableSpeeds] = useState<number[]>([]);
  const speedRef = useRef(1);
  const speedControlRef = useRef<HTMLDivElement>(null);
  const pendingQualityReloadRef = useRef(false);
  const qualityReloadUntilRef = useRef(0);
  const holdPauseRef = useRef(false);

  useEffect(() => {
    saveRef.current = saveVideoPosition;
    savedRef.current = savedPosition;
    urlStartRef.current = urlStart;
    titleRef.current = title;
  }, [saveVideoPosition, savedPosition, urlStart, title]);

  useEffect(() => {
    const sync = () => {
      setFullscreen(currentFullscreenElement() === frameRef.current);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener(
      "webkitfullscreenchange",
      sync as EventListener,
    );
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener(
        "webkitfullscreenchange",
        sync as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) {
      setControlsVisible(true);
      setControlsHeld(false);
      return;
    }
    setControlsVisible(true);
    setControlsEpoch((epoch) => epoch + 1);
  }, [fullscreen]);

  useEffect(() => {
    if (!controlsHeld) return;
    function release() {
      setControlsHeld(false);
      setControlsEpoch((epoch) => epoch + 1);
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [controlsHeld]);

  useEffect(() => {
    if (!fullscreen || !controlsVisible || controlsHeld) return;
    if (volumeOpen || qualityOpen || speedOpen) return;
    const timer = window.setTimeout(
      () => setControlsVisible(false),
      FULLSCREEN_CONTROLS_HIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    controlsEpoch,
    controlsHeld,
    controlsVisible,
    fullscreen,
    qualityOpen,
    speedOpen,
    volumeOpen,
  ]);

  function toggleFullscreenChrome() {
    if (controlsVisible) {
      setVolumeOpen(false);
      setQualityOpen(false);
      setSpeedOpen(false);
      setControlsVisible(false);
      return;
    }
    setControlsVisible(true);
    setControlsEpoch((epoch) => epoch + 1);
  }

  useLayoutEffect(() => {
    const stored = readStoredVideoQuality();
    qualityRef.current = stored;
    setQuality(stored);
    const storedSpeed = readStoredVideoSpeed();
    speedRef.current = storedSpeed;
    setSpeed(storedSpeed);
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let player: YouTubePlayer | null = null;
    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    host.appendChild(mount);

    const flushPlayback = (seconds: number, force = false) => {
      const addSeconds = pendingPlayedRef.current;
      pendingPlayedRef.current = 0;
      saveRef.current(progressKey, seconds, force, {
        addSeconds,
        title: titleRef.current,
        durationSeconds: durationRef.current,
      });
    };
    const persist = (seconds: number, force = false) => {
      flushPlayback(pinResumeAtStartRef.current ? 0 : seconds, force);
    };
    const resumeAt =
      savedRef.current > 0 ? savedRef.current : urlStartRef.current;

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !window.YT?.Player) return;
        player = new window.YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            start: Math.floor(resumeAt),
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              if (resumeAt >= 1) {
                event.target.seekTo(resumeAt, true);
                setCurrentTime(resumeAt);
              }
              if (variant !== "page") event.target.pauseVideo();
              const total = readDuration(event.target);
              if (total > 0) {
                durationRef.current = total;
                setDuration(total);
              }
              const iframe = event.target.getIframe();
              iframe.title = title;
              iframe.setAttribute("playsinline", "1");
              iframe.setAttribute(
                "allow",
                "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
              );
              iframe.style.position = "absolute";
              iframe.style.inset = "0";
              iframe.style.width = "100%";
              iframe.style.height = "100%";
              iframe.style.border = "none";
              applyPlaybackRate(event.target, speedRef.current);
              setReady(true);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event.data;
              if (
                state === YT_PLAYING ||
                state === YT_PAUSED ||
                state === YT_CUED
              ) {
                applyPlaybackRate(event.target, speedRef.current);
              }
              if (state === YT_PLAYING) {
                if (holdPauseRef.current) {
                  holdPauseRef.current = false;
                  event.target.pauseVideo();
                  setPlaying(false);
                  return;
                }
                autoplayHeardRef.current = true;
                if (autoplayMuteTimerRef.current !== null) {
                  window.clearTimeout(autoplayMuteTimerRef.current);
                  autoplayMuteTimerRef.current = null;
                }
                userStartedRef.current = true;
                samplePositionRef.current = readTime(event.target);
                setPlaying(true);
                setEnded(false);
              } else if (state === YT_PAUSED) {
                setPlaying(false);
                if (Date.now() < qualityReloadUntilRef.current) return;
                persist(readTime(event.target), true);
              } else if (state === YT_ENDED) {
                setPlaying(false);
                setEnded(true);
                pinResumeAtStartRef.current = true;
                const total = readDuration(event.target);
                if (total > 0) {
                  setDuration(total);
                  setCurrentTime(total);
                  persist(total, true);
                }
              }
            },
            onError: () => {
              if (cancelled) return;
              setPlaybackError(
                "Không phát được video này. Hãy kiểm tra lại liên kết YouTube.",
              );
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) {
          setPlaybackError(
            "Không tải được trình phát video. Hãy thử lại sau.",
          );
        }
      });

    const flush = () => {
      const active = playerRef.current;
      if (!active || Date.now() < qualityReloadUntilRef.current) return;
      const time = readTime(active);
      if (time < 1 && resumeAt >= 3) return;
      persist(time, true);
    };

    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    const poll = window.setInterval(() => {
      const active = playerRef.current;
      if (!active || scrubbingRef.current) return;
      const time = readTime(active);
      const total = readDuration(active);
      if (total > 0) {
        durationRef.current = total;
        setDuration(total);
      }
      setCurrentTime(time);
      try {
        const levels = active.getAvailableQualityLevels();
        if (Array.isArray(levels) && levels.length > 0) {
          setQualityLevels((current) =>
            current.join() === levels.join() ? current : levels,
          );
        }
        const actual = active.getPlaybackQuality();
        if (actual) {
          setActualQuality((current) => (current === actual ? current : actual));
        }
        const rates = active.getAvailablePlaybackRates();
        if (Array.isArray(rates) && rates.length > 0) {
          setAvailableSpeeds((current) =>
            current.length === rates.length &&
            current.every((rate, index) => rate === rates[index])
              ? current
              : rates,
          );
        }
      } catch {
        // Quality info is unavailable until the player finishes loading.
      }
      let state = YT_UNSTARTED;
      try {
        state = active.getPlayerState();
      } catch {
        return;
      }
      if (Date.now() < qualityReloadUntilRef.current) {
        samplePositionRef.current = time;
        return;
      }
      if (state === YT_PLAYING) {
        pendingPlayedRef.current += videoPlayedSeconds(samplePositionRef.current, time);
        samplePositionRef.current = time;
        const now = Date.now();
        if (now - lastPeriodicSaveRef.current >= 5000) {
          lastPeriodicSaveRef.current = now;
          persist(time);
        }
      } else {
        samplePositionRef.current = time;
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (autoplayMuteTimerRef.current !== null) {
        window.clearTimeout(autoplayMuteTimerRef.current);
        autoplayMuteTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
      try {
        player?.destroy();
      } catch {
        mount.remove();
      }
      playerRef.current = null;
    };
  }, [prefsReady, progressKey, title, variant, videoId]);

  useEffect(() => {
    if (!ready || userStartedRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const target = savedPosition > 0 ? savedPosition : urlStart;
    if (target < 1) return;
    if (Math.abs(readTime(player) - target) < 1) return;
    player.seekTo(target, true);
    setCurrentTime(target);
  }, [ready, savedPosition, urlStart]);

  useEffect(() => {
    if (variant !== "page" || !ready || !progressReady || autoplayAttemptedRef.current) {
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    autoplayAttemptedRef.current = true;
    const target = savedRef.current > 0 ? savedRef.current : urlStartRef.current;
    if (target >= 1 && Math.abs(readTime(player) - target) >= 1) {
      player.seekTo(target, true);
      setCurrentTime(target);
    }
    userStartedRef.current = true;
    try {
      player.unMute();
      setMuted(false);
      player.playVideo();
    } catch {
      // A browser can reject unmuted playback. The timer below starts it muted.
    }
    autoplayMuteTimerRef.current = window.setTimeout(() => {
      autoplayMuteTimerRef.current = null;
      const active = playerRef.current;
      if (!active || autoplayHeardRef.current || userPausedRef.current) return;
      try {
        active.mute();
        setMuted(true);
        active.playVideo();
      } catch {
        // Playback stays paused until the learner presses play.
      }
    }, 1500);
  }, [progressReady, ready, variant]);

  useEffect(() => {
    const leadReached =
      duration > MARK_WATCHED_LEAD_SECONDS &&
      currentTime >= duration - MARK_WATCHED_LEAD_SECONDS;
    const finishedShort =
      ended && duration > 0 && duration <= MARK_WATCHED_LEAD_SECONDS;
    if (!leadReached && !finishedShort) return;
    const alreadyPinned = pinResumeAtStartRef.current;
    pinResumeAtStartRef.current = true;
    if (!watched) {
      setVideoWatched(progressKey, true, {
        title,
        positionSeconds: currentTime,
        durationSeconds: duration,
      });
      return;
    }
    if (!alreadyPinned) saveVideoPosition(progressKey, 0, true);
  }, [
    currentTime,
    duration,
    ended,
    progressKey,
    saveVideoPosition,
    setVideoWatched,
    title,
    watched,
  ]);

  const nearEnd =
    duration > 0 &&
    currentTime >= Math.max(0, duration - MARK_WATCHED_LEAD_SECONDS);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    userStartedRef.current = true;
    if (playing) {
      userPausedRef.current = true;
      player.pauseVideo();
    } else {
      userPausedRef.current = false;
      player.playVideo();
    }
  }

  function seekTo(seconds: number) {
    const player = playerRef.current;
    if (!player) return;
    userStartedRef.current = true;
    const next = Math.max(0, seconds);
    const total = durationRef.current;
    const stillInEnding =
      total > MARK_WATCHED_LEAD_SECONDS &&
      next >= total - MARK_WATCHED_LEAD_SECONDS;
    if (!stillInEnding) pinResumeAtStartRef.current = false;
    pendingSeekRef.current = next;
    samplePositionRef.current = next;
    setCurrentTime(next);
    setEnded(false);
    player.seekTo(next, true);
  }

  function commitSeek() {
    scrubbingRef.current = false;
    const player = playerRef.current;
    const time = pendingSeekRef.current ?? (player ? readTime(player) : currentTime);
    pendingSeekRef.current = null;
    setCurrentTime(time);
    saveVideoPosition(
      progressKey,
      pinResumeAtStartRef.current ? 0 : time,
      true,
    );
  }

  function toggleMute() {
    const player = playerRef.current;
    if (!player) return;
    if (muted || volume === 0) {
      player.unMute();
      const restored = volume > 0 ? volume : 100;
      if (volumeSupported) player.setVolume(restored);
      setVolume(restored);
      setMuted(false);
      return;
    }
    player.mute();
    setMuted(true);
  }

  useLayoutEffect(() => {
    if (!prefsReady) return;

    const applyHostScale = () => {
      const stage = stageRef.current;
      const scaleEl = scaleRef.current;
      if (!stage || !scaleEl) return;
      stage.scrollTop = 0;
      stage.scrollLeft = 0;
      const frame = QUALITY_FRAME[qualityRef.current];
      if (!frame || stage.clientWidth < 1) {
        scaleEl.style.width = "100%";
        scaleEl.style.height = "100%";
        scaleEl.style.transform = "none";
        return;
      }
      scaleEl.style.width = `${frame.width}px`;
      scaleEl.style.height = `${frame.height}px`;
      scaleEl.style.transformOrigin = "top left";
      scaleEl.style.transform = `scale(${stage.clientWidth / frame.width})`;
    };

    const fitIframe = (player: YouTubePlayer) => {
      const host = hostRef.current;
      if (!host) return;
      const width = Math.round(host.clientWidth);
      const height = Math.round(host.clientHeight);
      if (width < 1 || height < 1) return;
      try {
        player.setSize(width, height);
        const iframe = player.getIframe();
        const widget = iframe.parentElement;
        if (widget && widget !== host) {
          widget.style.width = "100%";
          widget.style.height = "100%";
        }
        iframe.style.position = "absolute";
        iframe.style.inset = "0";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
      } catch {
        // The player can reject a resize while it is being destroyed.
      }
    };

    applyHostScale();
    const stage = stageRef.current;
    const observer = stage
      ? new ResizeObserver(() => {
          applyHostScale();
          const player = playerRef.current;
          if (!player || qualityRef.current !== "auto") return;
          fitIframe(player);
        })
      : null;
    if (stage && observer) observer.observe(stage);

    let frameId = 0;
    if (ready && playerRef.current) {
      frameId = window.requestAnimationFrame(() => {
        const player = playerRef.current;
        if (!player) return;
        fitIframe(player);
        if (!pendingQualityReloadRef.current) return;
        pendingQualityReloadRef.current = false;
        const time = readTime(player);
        qualityReloadUntilRef.current = Date.now() + 2500;
        samplePositionRef.current = time;
        let playingNow = false;
        try {
          playingNow = player.getPlayerState() === YT_PLAYING;
        } catch {
          playingNow = false;
        }
        if (!playingNow) holdPauseRef.current = true;
        const selected = qualityRef.current;
        player.loadVideoById(
          selected === "auto"
            ? { videoId, startSeconds: time }
            : {
                videoId,
                startSeconds: time,
                suggestedQuality: selected,
              },
        );
        applyPlaybackRate(player, speedRef.current);
      });
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [prefsReady, quality, fullscreen, ready, videoId]);

  function toggleFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    if (currentFullscreenElement() === frame) {
      void leaveFullscreen();
      return;
    }
    void enterFullscreen(frame);
  }

  function changeQuality(next: string) {
    setQualityOpen(false);
    if (next === qualityRef.current) return;
    qualityRef.current = next;
    storeVideoQuality(next);
    pendingQualityReloadRef.current = true;
    setQuality(next);
  }

  function changeSpeed(next: number) {
    setSpeedOpen(false);
    if (next === speedRef.current) return;
    speedRef.current = next;
    storeVideoSpeed(next);
    setSpeed(next);
    const player = playerRef.current;
    if (!player) return;
    applyPlaybackRate(player, next);
  }

  function changeVolume(next: number) {
    const player = playerRef.current;
    if (!player || !volumeSupported) return;
    setVolume(next);
    player.setVolume(next);
    if (next === 0) {
      player.mute();
      setMuted(true);
    } else {
      player.unMute();
      setMuted(false);
    }
  }

  useEffect(() => {
    if (!volumeOpen && !qualityOpen && !speedOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (volumeControlRef.current && !volumeControlRef.current.contains(target)) {
        setVolumeOpen(false);
      }
      if (qualityControlRef.current && !qualityControlRef.current.contains(target)) {
        setQualityOpen(false);
      }
      if (speedControlRef.current && !speedControlRef.current.contains(target)) {
        setSpeedOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setVolumeOpen(false);
      setQualityOpen(false);
      setSpeedOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [qualityOpen, speedOpen, volumeOpen]);

  const menuQualities = (
    qualityLevels.some((level) => QUALITY_FRAME[level])
      ? qualityLevels
      : ["hd1080", "hd720", "medium"]
  )
    .filter((level) => level !== "auto" && QUALITY_FRAME[level])
    .sort(
      (a, b) =>
        QUALITY_RANK.indexOf(a) - QUALITY_RANK.indexOf(b),
    );
  const qualityButtonLabel = QUALITY_LABEL[quality] ?? "Tự động";
  const offeredSpeeds =
    availableSpeeds.length > 0
      ? VIDEO_SPEEDS.filter((rate) =>
          availableSpeeds.some((available) => Math.abs(available - rate) < 0.01),
        )
      : VIDEO_SPEEDS;
  const menuSpeeds = offeredSpeeds.length > 0 ? offeredSpeeds : VIDEO_SPEEDS;

  if (playbackError) {
    return <VideoError message={playbackError} />;
  }

  const page = variant === "page";

  const toolButtonClass = fullscreen
    ? "bg-white/15 disabled:text-white/35"
    : "bg-[#f5f5f7] disabled:text-[#d2d2d7]";
  const toolIconClass = fullscreen ? "text-white" : "text-[#1d1d1f]";

  return (
    <div className={page ? "flex flex-col gap-3 sm:gap-4" : "flex flex-col gap-4"}>
      <div
        ref={frameRef}
        className={
          fullscreen
            ? "relative flex h-full w-full flex-col bg-black"
            : page
              ? "flex flex-col gap-3 sm:gap-4"
              : "flex flex-col gap-4"
        }
      >
      <div
        className={`relative w-full overflow-hidden bg-[#131b2e] ${
          fullscreen
            ? "flex h-full min-h-0 flex-1 items-center justify-center bg-black"
            : page
              ? "aspect-video rounded-[24px] shadow-[0_8px_0_0_#c5d8ea] sm:rounded-[28px]"
              : "aspect-video rounded-[16px]"
        }`}
      >
        <div
          ref={stageRef}
          className={`overflow-clip ${
            fullscreen
              ? "relative aspect-video h-[min(100%,calc(100vw*9/16))] w-[min(100%,calc(100vh*16/9))]"
              : "absolute inset-0"
          }`}
        >
          <div ref={scaleRef} className="absolute top-0 left-0 h-full w-full">
            <div
              ref={hostRef}
              className="absolute left-0 w-full"
              style={{
                top: -YOUTUBE_CHROME_CROP_PX,
                height: `calc(100% + ${YOUTUBE_CHROME_CROP_PX * 2}px)`,
              }}
            />
          </div>
          {ready && !fullscreen ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Toàn màn hình"
              className="absolute right-3 bottom-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-[0_2px_8px_rgb(0,0,0,0.25)] backdrop-blur-md transition active:scale-95"
            >
              <MaterialIcon name="fullscreen" className="text-[22px]" />
            </button>
          ) : null}
        </div>
        {!ready ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] font-medium text-white/80">
            Đang tải video…
          </p>
        ) : null}
      </div>

      {fullscreen ? (
        <button
          type="button"
          onClick={toggleFullscreenChrome}
          aria-label={controlsVisible ? "Ẩn điều khiển" : "Hiện điều khiển"}
          className="absolute inset-0 z-10"
        />
      ) : null}

      <div
        onPointerDown={
          fullscreen
            ? () => {
                setControlsHeld(true);
              }
            : undefined
        }
        aria-hidden={fullscreen && !controlsVisible ? true : undefined}
        className={
          fullscreen
            ? `absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-10 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] transition-transform duration-300 ease-out sm:px-5 sm:pt-12 sm:pb-4 ${
                controlsVisible
                  ? "translate-y-0"
                  : "pointer-events-none translate-y-full"
              }`
            : page
              ? "rounded-[24px] bg-white p-2.5 shadow-[0_4px_0_0_#e2e8f0] sm:p-3.5"
              : undefined
        }
      >
      <div
        className={
          fullscreen
            ? "relative z-10 flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3"
            : "relative z-10 flex flex-nowrap items-center gap-1 sm:gap-3"
        }
      >
        <button
          type="button"
          onClick={togglePlay}
          disabled={!ready}
          aria-label={playing ? "Tạm dừng" : "Phát"}
          className={
            fullscreen
              ? "order-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0284c7] text-white shadow-[0_3px_0_0_#0369a1] transition hover:bg-[#0ea5e9] active:translate-y-0.5 active:shadow-none disabled:bg-[#d2d2d7] disabled:shadow-none sm:order-none sm:h-12 sm:w-12"
              : page
              ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0284c7] text-white shadow-[0_4px_0_0_#0369a1] transition hover:bg-[#0ea5e9] active:translate-y-1 active:shadow-none disabled:bg-[#d2d2d7] disabled:shadow-none sm:h-14 sm:w-14"
              : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc] text-white transition active:scale-95 disabled:bg-[#d2d2d7]"
          }
        >
          <MaterialIcon
            name={playing ? "pause" : "play_arrow"}
            className="text-[26px]"
            filled
          />
        </button>
        <div
          className={
            fullscreen
              ? "order-1 flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1 sm:gap-3"
              : "flex min-w-0 flex-1 items-center gap-1 sm:gap-3"
          }
        >
        <span
          className={`min-w-9 shrink-0 whitespace-nowrap text-right text-[13px] font-semibold tabular-nums ${
            fullscreen ? "text-white" : "text-[#1d1d1f]"
          }`}
        >
          {formatClock(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 0}
          step={0.1}
          value={duration > 0 ? Math.min(currentTime, duration) : 0}
          disabled={!ready || duration <= 0}
          aria-label="Tiến độ video"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatClock(currentTime)} / ${formatClock(duration)}`}
          onPointerDown={() => {
            scrubbingRef.current = true;
          }}
          onChange={(event) => seekTo(Number(event.target.value))}
          onPointerUp={commitSeek}
          onPointerCancel={commitSeek}
          onTouchEnd={commitSeek}
          onKeyUp={commitSeek}
          onBlur={commitSeek}
          className={`h-11 w-0 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed ${
            fullscreen ? "accent-white" : page ? "accent-[#0284c7]" : "accent-[#0066cc]"
          }`}
        />
        <span
          className={`min-w-9 shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums ${
            fullscreen
              ? "text-white/75"
              : "hidden text-[#86868b] min-[400px]:inline"
          }`}
        >
          {formatClock(duration)}
        </span>
        </div>
        <div
          className={
            fullscreen
              ? "order-3 ml-auto flex shrink-0 items-center gap-1 sm:order-none sm:ml-0 sm:gap-3"
              : "flex shrink-0 items-center gap-1 sm:gap-3"
          }
        >
        <div ref={volumeControlRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!volumeSupported) {
                toggleMute();
                return;
              }
              setQualityOpen(false);
              setSpeedOpen(false);
              setVolumeOpen((open) => !open);
            }}
            disabled={!ready}
            aria-label={
              volumeSupported ? "Âm lượng" : muted ? "Bật tiếng" : "Tắt tiếng"
            }
            aria-expanded={volumeSupported ? volumeOpen : undefined}
            aria-pressed={muted}
            className={`flex items-center justify-center rounded-full transition active:scale-95 ${
              fullscreen ? "h-10 w-10 sm:h-11 sm:w-11" : "h-11 w-11"
            } ${toolButtonClass} ${toolIconClass}`}
          >
            <MaterialIcon
              name={muted || volume === 0 ? "volume_off" : "volume_up"}
              className="text-[22px]"
              filled
            />
          </button>
          {volumeSupported && volumeOpen ? (
            <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-20 flex h-36 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-black/[0.06] bg-white shadow-[0_8px_24px_rgb(0,0,0,0.12)]">
              <VerticalVolumeSlider
                value={muted ? 0 : volume}
                disabled={!ready}
                onChange={changeVolume}
              />
            </div>
          ) : null}
        </div>
        <div ref={speedControlRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setVolumeOpen(false);
              setQualityOpen(false);
              setSpeedOpen((open) => !open);
            }}
            disabled={!ready}
            aria-label="Tốc độ phát"
            aria-haspopup="menu"
            aria-expanded={speedOpen}
            className={`flex shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums transition active:scale-95 ${
              fullscreen ? "h-10 px-2 sm:h-11 sm:px-3" : "h-11 px-2.5 sm:px-3"
            } ${toolButtonClass} ${
              speed === 1
                ? toolIconClass
                : fullscreen
                  ? "text-[#7dd3fc]"
                  : page
                    ? "text-[#0284c7]"
                    : "text-[#0066cc]"
            }`}
          >
            {formatVideoSpeed(speed)}
          </button>
          {speedOpen ? (
            <div
              role="menu"
              aria-label="Tốc độ phát"
              className="absolute right-0 bottom-[calc(100%+8px)] z-20 min-w-[148px] overflow-hidden rounded-2xl border border-black/[0.06] bg-white py-1 shadow-[0_8px_24px_rgb(0,0,0,0.12)]"
            >
              {menuSpeeds.map((rate) => {
                const selected = rate === speed;
                return (
                  <button
                    key={rate}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => changeSpeed(rate)}
                    className={`flex h-11 w-full items-center justify-between gap-4 px-4 text-left text-[15px] font-semibold tabular-nums ${
                      selected
                        ? page
                          ? "text-[#0284c7]"
                          : "text-[#0066cc]"
                        : "text-[#1d1d1f]"
                    }`}
                  >
                    <span>{formatVideoSpeed(rate)}</span>
                    {selected ? (
                      <MaterialIcon name="check" className="text-[18px]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div ref={qualityControlRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setVolumeOpen(false);
              setSpeedOpen(false);
              setQualityOpen((open) => !open);
            }}
            disabled={!ready}
            aria-label="Chất lượng video"
            aria-haspopup="menu"
            aria-expanded={qualityOpen}
            className={`flex shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition active:scale-95 ${
              fullscreen ? "h-10 sm:h-11" : "h-11"
            } ${toolButtonClass} ${toolIconClass} ${
              quality === "auto"
                ? fullscreen
                  ? "w-10 sm:w-11"
                  : "w-11"
                : fullscreen
                  ? "px-2 sm:px-3"
                  : "px-2 min-[400px]:px-3"
            }`}
          >
            {quality === "auto" ? (
              <MaterialIcon name="hd" className="text-[22px]" />
            ) : (
              qualityButtonLabel
            )}
          </button>
          {qualityOpen ? (
            <div
              role="menu"
              aria-label="Chất lượng video"
              className="absolute right-0 bottom-[calc(100%+8px)] z-20 min-w-[168px] overflow-hidden rounded-2xl border border-black/[0.06] bg-white py-1 shadow-[0_8px_24px_rgb(0,0,0,0.12)]"
            >
              {["auto", ...menuQualities].map((level) => {
                const selected = level === quality;
                const label = QUALITY_LABEL[level] ?? level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => changeQuality(level)}
                    className={`flex h-11 w-full items-center justify-between gap-4 px-4 text-left text-[15px] font-semibold ${
                      selected
                        ? page
                          ? "text-[#0284c7]"
                          : "text-[#0066cc]"
                        : "text-[#1d1d1f]"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="flex items-center gap-2">
                      {level === "auto" && selected && QUALITY_LABEL[actualQuality] ? (
                        <span className="text-[13px] font-semibold text-[#86868b]">
                          {QUALITY_LABEL[actualQuality]}
                        </span>
                      ) : null}
                      {selected ? (
                        <MaterialIcon name="check" className="text-[18px]" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        {fullscreen ? (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Thoát toàn màn hình"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 sm:h-11 sm:w-11 ${toolButtonClass} ${toolIconClass}`}
          >
            <MaterialIcon name="fullscreen_exit" className="text-[22px]" />
          </button>
        ) : null}
        </div>
      </div>
      </div>
      </div>

      {!watched && (ended || nearEnd) ? (
        <button
          type="button"
          onClick={() => {
            pinResumeAtStartRef.current = true;
            setVideoWatched(progressKey, true, {
              title,
              positionSeconds: currentTime,
              durationSeconds: duration,
            });
          }}
          className={
            page
              ? "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#58cc02] px-6 text-[15px] font-extrabold uppercase tracking-wider text-white shadow-[0_4px_0_0_#58a700] transition hover:bg-[#61e002] active:translate-y-1 active:shadow-none"
              : "inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-full bg-[#0066cc] px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]"
          }
        >
          <MaterialIcon name="check" className="text-[20px]" />
          Đánh dấu đã xem
        </button>
      ) : null}
      {watched && nextCard ? (
        <Link
          href={nextCard.href}
          className={
            page
              ? "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#58cc02] px-6 text-[15px] font-extrabold text-white shadow-[0_4px_0_0_#58a700] transition hover:bg-[#61e002] active:translate-y-1 active:shadow-none"
              : "inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-full bg-[#0066cc] px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]"
          }
        >
          <span className="uppercase tracking-wider">Tiếp theo</span>
          <span className="max-w-[14rem] truncate font-bold tracking-normal">
            {nextCard.label}
          </span>
          <MaterialIcon name="arrow_forward" className="text-[20px]" />
        </Link>
      ) : null}
    </div>
  );
}

export function VideoLessonCard({
  levelSlug,
  chapterSlug,
  videos,
  presentation = "card",
  initialVideoId = null,
  nextCard = null,
}: VideoLessonCardProps) {
  const { lessonVideoProgressFor } = useProgress();
  const requestedIndex = initialVideoId
    ? videos.findIndex((item) => item.videoId === initialVideoId)
    : -1;
  const [selectedIndex, setSelectedIndex] = useState(
    requestedIndex >= 0 ? requestedIndex : 0,
  );
  const pickedByUserRef = useRef(requestedIndex >= 0);
  const selectedWasWatchedRef = useRef(false);
  const prevProgressKeyRef = useRef<string | null>(null);

  const uncompletedIndex = firstUncompletedVideoIndex(
    videos,
    levelSlug,
    chapterSlug,
    lessonVideoProgressFor,
  );
  const video = videos[selectedIndex] ?? videos[0];
  const progressKey = video?.videoId
    ? lessonVideoProgressKey(levelSlug, chapterSlug, video.videoId)
    : null;
  const entry = progressKey ? lessonVideoProgressFor(progressKey) : undefined;
  const selectedWatched = lessonVideoStatus(entry) === "watched";

  useLayoutEffect(() => {
    if (presentation === "page" || pickedByUserRef.current || uncompletedIndex == null) return;
    setSelectedIndex(uncompletedIndex);
  }, [presentation, uncompletedIndex]);

  useEffect(() => {
    const keyChanged = prevProgressKeyRef.current !== progressKey;
    prevProgressKeyRef.current = progressKey;
    if (keyChanged) {
      selectedWasWatchedRef.current = selectedWatched;
      return;
    }
    const wasWatched = selectedWasWatchedRef.current;
    selectedWasWatchedRef.current = selectedWatched;
    if (
      presentation !== "page" &&
      !wasWatched &&
      selectedWatched &&
      uncompletedIndex != null
    ) {
      pickedByUserRef.current = false;
      setSelectedIndex(uncompletedIndex);
    }
  }, [presentation, progressKey, selectedWatched, uncompletedIndex]);

  if (!video) return null;

  const player =
    video.videoId && progressKey ? (
      <YouTubePane
        key={progressKey}
        variant={presentation}
        videoId={video.videoId}
        title={video.title}
        savedPosition={entry?.positionSeconds ?? 0}
        urlStart={video.startSeconds}
        progressKey={progressKey}
        nextCard={nextCard}
      />
    ) : (
      <VideoError message="Không phát được video này. Hãy kiểm tra lại liên kết YouTube." />
    );

  if (presentation === "page") {
    const status = video.videoId ? lessonVideoStatus(entry) : null;
    return (
      <section className="flex w-full flex-col gap-4 sm:gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-extrabold leading-tight tracking-tight text-[#131b2e] sm:text-[32px] lg:text-[36px]">
              {video.title}
            </h2>
            {video.titleVi ? (
              <p className="truncate text-[14px] font-bold leading-5 text-[#64748b] sm:text-[16px]">
                {video.titleVi}
              </p>
            ) : null}
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider sm:text-[12px] ${
              status === "watched"
                ? "bg-[#d7ffb8] text-[#3d6b00]"
                : status === "in-progress"
                  ? "bg-sky-100 text-[#0284c7]"
                  : "bg-[#e8eef4] text-[#64748b]"
            }`}
          >
            {status ? LESSON_VIDEO_STATUS_LABEL[status] : "Lỗi liên kết"}
          </span>
        </div>
        {player}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 overflow-hidden rounded-[24px] border border-white/20 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:p-7">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#e8f2fc] text-[#0066cc]">
          <MaterialIcon name="smart_display" className="text-[24px]" filled />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            className="text-2xl font-semibold tracking-tight text-[#1d1d1f] sm:text-[28px]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Video bài học
          </h2>
          <p className="text-[15px] font-medium leading-relaxed text-[#86868b] sm:text-[17px]">
            {video.title}
          </p>
          {videos.length === 1 ? (
            <span
              className={`text-[12px] font-bold uppercase tracking-wider ${
                video.videoId && lessonVideoStatus(entry) !== "not-started"
                  ? "text-[#0066cc]"
                  : "text-[#86868b]"
              }`}
            >
              {video.videoId
                ? LESSON_VIDEO_STATUS_LABEL[lessonVideoStatus(entry)]
                : "Lỗi liên kết"}
            </span>
          ) : null}
        </div>
      </div>

      {videos.length > 1 ? (
        <ul className="flex flex-col gap-2">
          {videos.map((item, index) => {
            const key = item.videoId
              ? lessonVideoProgressKey(levelSlug, chapterSlug, item.videoId)
              : null;
            const status = lessonVideoStatus(
              key ? lessonVideoProgressFor(key) : undefined,
            );
            const selected = index === selectedIndex;
            return (
              <li key={`${item.url}-${index}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    pickedByUserRef.current = true;
                    setSelectedIndex(index);
                  }}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                    selected ? "bg-[#e8f2fc]" : "bg-[#f5f5f7] hover:bg-[#ececf1]"
                  }`}
                >
                  <MaterialIcon
                    name={item.videoId ? "play_circle" : "error"}
                    className={`text-[22px] ${selected ? "text-[#0066cc]" : "text-[#86868b]"}`}
                    filled={selected}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#1d1d1f]">
                    {item.title}
                  </span>
                  <span
                    className={`shrink-0 text-[12px] font-bold uppercase tracking-wider ${
                      item.videoId
                        ? status === "not-started"
                          ? "text-[#86868b]"
                          : "text-[#0066cc]"
                        : "text-[#86868b]"
                    }`}
                  >
                    {item.videoId ? LESSON_VIDEO_STATUS_LABEL[status] : "Lỗi liên kết"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {player}
    </section>
  );
}

export function VideoLessonScreen({
  level,
  chapter,
  videos,
  initialVideoId = null,
  nextCard = null,
}: {
  level: CefrLevel;
  chapter: LevelChapterMeta;
  videos: ChapterVideo[];
  initialVideoId?: string | null;
  nextCard?: NextLessonCard | null;
}) {
  return (
    <main
      data-layout="wide"
      className="relative flex min-h-dvh w-full max-w-none flex-1 flex-col overflow-x-hidden bg-[#f7fbff] selection:bg-[#0284c7] selection:text-white"
      style={{
        fontFamily:
          "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif",
      }}
    >
      <header className="sticky top-0 z-50 w-full border-b border-sky-100 bg-white/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto grid h-14 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:h-16 sm:px-8">
          <Link
            href={`/learn/${level.slug}?lektion=${encodeURIComponent(chapter.slug)}`}
            className="group flex h-11 w-fit items-center gap-1 rounded-full pr-2 text-[#0284c7] transition hover:bg-sky-50 active:translate-y-px"
          >
            <span className="material-symbols-outlined text-[20px] font-medium" aria-hidden="true">
              arrow_back_ios_new
            </span>
            <span className="text-[16px] font-extrabold tracking-tight sm:text-[17px]">Trở về</span>
          </Link>
          <div className="flex min-w-0 max-w-[46vw] flex-col items-center justify-center text-center sm:max-w-xs">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#0284c7]">
              {level.level}
            </span>
            <h1 className="truncate text-[15px] font-extrabold tracking-tight text-[#131b2e] sm:text-[17px]">
              {chapter.label}
            </h1>
          </div>
          <div className="flex justify-end">
            <ProfileButton />
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:justify-center sm:px-8 sm:py-8 lg:py-10">
        <div
          className="flex w-full flex-col"
          style={{ maxWidth: "min(100%, calc(58dvh * 16 / 9))" }}
        >
          <VideoLessonCard
            presentation="page"
            levelSlug={level.slug}
            chapterSlug={chapter.slug}
            videos={videos}
            initialVideoId={initialVideoId}
            nextCard={nextCard}
          />
        </div>
      </section>
    </main>
  );
}
