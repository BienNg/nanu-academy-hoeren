"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { ChapterVideo } from "@/lib/levels";
import {
  lessonVideoProgressKey,
  lessonVideoStatus,
  type LessonVideoProgress,
  type LessonVideoStatus,
} from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";
import {
  loadYouTubeIframeApi,
  supportsProgrammaticVolume,
  YT_ENDED,
  YT_PAUSED,
  YT_PLAYING,
  YT_UNSTARTED,
  type YouTubePlayer,
} from "@/lib/youtube";

type VideoLessonCardProps = {
  levelSlug: string;
  chapterSlug: string;
  videos: ChapterVideo[];
};

const STATUS_LABEL: Record<LessonVideoStatus, string> = {
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

/** Shifts the embed so YouTube's title and Share / Save sit outside the clip. */
const YOUTUBE_CHROME_CROP_PX = 60;

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
}: {
  videoId: string;
  title: string;
  savedPosition: number;
  urlStart: number;
  progressKey: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const skipPlayerResizeRef = useRef(true);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const saveRef = useRef<
    (key: string, positionSeconds: number, force?: boolean) => void
  >(() => {});
  const savedRef = useRef(savedPosition);
  const urlStartRef = useRef(urlStart);
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const userStartedRef = useRef(false);
  const lastPeriodicSaveRef = useRef(0);
  const { saveVideoPosition, setVideoWatched, lessonVideoProgressFor } =
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

  useEffect(() => {
    saveRef.current = saveVideoPosition;
    savedRef.current = savedPosition;
    urlStartRef.current = urlStart;
  }, [saveVideoPosition, savedPosition, urlStart]);

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
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let player: YouTubePlayer | null = null;
    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    host.appendChild(mount);

    const persist = (seconds: number, force = false) => {
      saveRef.current(progressKey, seconds, force);
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
            // YouTube no longer honors setPlaybackQuality, so there is no quality menu.
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
              event.target.pauseVideo();
              const total = readDuration(event.target);
              if (total > 0) setDuration(total);
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
              setReady(true);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event.data;
              if (state === YT_PLAYING) {
                userStartedRef.current = true;
                setPlaying(true);
                setEnded(false);
              } else if (state === YT_PAUSED) {
                setPlaying(false);
                persist(readTime(event.target), true);
              } else if (state === YT_ENDED) {
                setPlaying(false);
                setEnded(true);
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
      if (!active) return;
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
      if (total > 0) setDuration(total);
      setCurrentTime(time);
      let state = YT_UNSTARTED;
      try {
        state = active.getPlayerState();
      } catch {
        return;
      }
      if (state === YT_PLAYING) {
        const now = Date.now();
        if (now - lastPeriodicSaveRef.current >= 5000) {
          lastPeriodicSaveRef.current = now;
          persist(time);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
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
  }, [progressKey, title, videoId]);

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

  const nearEnd =
    duration > 0 &&
    currentTime >= Math.max(0, duration - MARK_WATCHED_LEAD_SECONDS);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    userStartedRef.current = true;
    if (playing) player.pauseVideo();
    else player.playVideo();
  }

  function seekTo(seconds: number) {
    const player = playerRef.current;
    if (!player) return;
    userStartedRef.current = true;
    const next = Math.max(0, seconds);
    pendingSeekRef.current = next;
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
    saveVideoPosition(progressKey, time, true);
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

  useEffect(() => {
    if (!ready) return;
    if (skipPlayerResizeRef.current) {
      skipPlayerResizeRef.current = false;
      return;
    }
    const id = window.requestAnimationFrame(() => {
      const host = hostRef.current;
      const player = playerRef.current;
      if (!host || !player) return;
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
    });
    return () => window.cancelAnimationFrame(id);
  }, [fullscreen, ready]);

  function toggleFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    if (currentFullscreenElement() === frame) {
      void leaveFullscreen();
      return;
    }
    void enterFullscreen(frame);
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
    if (!volumeOpen) return;
    function onPointerDown(event: PointerEvent) {
      const root = volumeControlRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setVolumeOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setVolumeOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [volumeOpen]);

  if (playbackError) {
    return <VideoError message={playbackError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={frameRef}
        className={`relative w-full overflow-hidden bg-[#1d1d1f] ${
          fullscreen
            ? "flex h-full items-center justify-center bg-black"
            : "aspect-video rounded-[16px]"
        }`}
      >
        <div
          className={`overflow-hidden ${
            fullscreen
              ? "relative aspect-video h-[min(100%,calc(100vw*9/16))] w-[min(100%,calc(100vh*16/9))]"
              : "absolute inset-0"
          }`}
        >
          <div
            ref={hostRef}
            className="absolute left-0 w-full"
            style={{
              top: -YOUTUBE_CHROME_CROP_PX,
              height: `calc(100% + ${YOUTUBE_CHROME_CROP_PX * 2}px)`,
            }}
          />
          {ready ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
              className="absolute right-3 bottom-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-[0_2px_8px_rgb(0,0,0,0.25)] backdrop-blur-md transition active:scale-95"
            >
              <MaterialIcon
                name={fullscreen ? "fullscreen_exit" : "fullscreen"}
                className="text-[22px]"
              />
            </button>
          ) : null}
        </div>
        {!ready ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] font-medium text-white/80">
            Đang tải video…
          </p>
        ) : null}
      </div>

      <div className="relative z-10 flex flex-nowrap items-center gap-1 sm:gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!ready}
          aria-label={playing ? "Tạm dừng" : "Phát"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc] text-white transition active:scale-95 disabled:bg-[#d2d2d7]"
        >
          <MaterialIcon
            name={playing ? "pause" : "play_arrow"}
            className="text-[26px]"
            filled
          />
        </button>
        <span className="min-w-9 shrink-0 whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-[#1d1d1f]">
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
          className="h-11 w-0 min-w-0 flex-1 cursor-pointer accent-[#0066cc] disabled:cursor-not-allowed"
        />
        <span className="min-w-9 shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums text-[#86868b]">
          {formatClock(duration)}
        </span>
        <div ref={volumeControlRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!volumeSupported) {
                toggleMute();
                return;
              }
              setVolumeOpen((open) => !open);
            }}
            disabled={!ready}
            aria-label={
              volumeSupported ? "Âm lượng" : muted ? "Bật tiếng" : "Tắt tiếng"
            }
            aria-expanded={volumeSupported ? volumeOpen : undefined}
            aria-pressed={muted}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f5f5f7] text-[#1d1d1f] transition active:scale-95 disabled:text-[#d2d2d7]"
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
      </div>

      {!watched && (ended || nearEnd) ? (
        <button
          type="button"
          onClick={() => setVideoWatched(progressKey, true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-full bg-[#0066cc] px-5 text-[15px] font-semibold text-white transition active:scale-[0.98]"
        >
          <MaterialIcon name="check" className="text-[20px]" />
          Đánh dấu đã xem
        </button>
      ) : null}
    </div>
  );
}

export function VideoLessonCard({
  levelSlug,
  chapterSlug,
  videos,
}: VideoLessonCardProps) {
  const { lessonVideoProgressFor } = useProgress();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const pickedByUserRef = useRef(false);
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
    if (pickedByUserRef.current || uncompletedIndex == null) return;
    setSelectedIndex(uncompletedIndex);
  }, [uncompletedIndex]);

  useEffect(() => {
    const keyChanged = prevProgressKeyRef.current !== progressKey;
    prevProgressKeyRef.current = progressKey;
    if (keyChanged) {
      selectedWasWatchedRef.current = selectedWatched;
      return;
    }
    const wasWatched = selectedWasWatchedRef.current;
    selectedWasWatchedRef.current = selectedWatched;
    if (!wasWatched && selectedWatched && uncompletedIndex != null) {
      pickedByUserRef.current = false;
      setSelectedIndex(uncompletedIndex);
    }
  }, [progressKey, selectedWatched, uncompletedIndex]);

  if (!video) return null;

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
                ? STATUS_LABEL[lessonVideoStatus(entry)]
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
                    {item.videoId ? STATUS_LABEL[status] : "Lỗi liên kết"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {video.videoId && progressKey ? (
        <YouTubePane
          key={progressKey}
          videoId={video.videoId}
          title={video.title}
          savedPosition={entry?.positionSeconds ?? 0}
          urlStart={video.startSeconds}
          progressKey={progressKey}
        />
      ) : (
        <VideoError message="Không phát được video này. Hãy kiểm tra lại liên kết YouTube." />
      )}
    </section>
  );
}
