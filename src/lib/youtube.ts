/** YouTube link parsing and the IFrame Player API loader. */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
]);

const PATH_MARKERS = new Set(["embed", "shorts", "live", "v", "e"]);

export type ParsedYouTubeUrl = {
  videoId: string;
  startSeconds: number;
};

export type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  setSize: (width: number, height: number) => void;
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
};

export type YouTubePlayerEvent = {
  data: number;
  target: YouTubePlayer;
};

type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: { target: YouTubePlayer }) => void;
      onStateChange?: (event: YouTubePlayerEvent) => void;
      onError?: (event: YouTubePlayerEvent) => void;
    };
  },
) => YouTubePlayer;

declare global {
  interface Window {
    YT?: {
      Player: YouTubePlayerConstructor;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YT_ENDED = 0;
export const YT_PLAYING = 1;
export const YT_PAUSED = 2;
export const YT_CUED = 5;
export const YT_UNSTARTED = -1;

/**
 * Accepts watch, youtu.be, Shorts, embed, and live links, including t/start timestamps.
 * Returns null when the link is not a YouTube URL with an 11-character video id.
 */
export function parseYouTubeUrl(raw: string): ParsedYouTubeUrl | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const videoId = extractVideoId(host, url);
  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;

  return {
    videoId,
    startSeconds: parseStartSeconds(url),
  };
}

function extractVideoId(host: string, url: URL): string | null {
  if (host === "youtu.be") {
    return firstPathSegment(url.pathname);
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (url.pathname === "/watch" || url.pathname.startsWith("/watch/")) {
    return url.searchParams.get("v");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const markerIndex = parts.findIndex((part) => PATH_MARKERS.has(part));
  if (markerIndex === -1) return null;
  return parts[markerIndex + 1] ?? null;
}

function firstPathSegment(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ?? null;
}

function parseStartSeconds(url: URL): number {
  const raw =
    url.searchParams.get("t") ??
    url.searchParams.get("start") ??
    timestampFromHash(url.hash);
  if (!raw) return 0;
  return parseTimestamp(raw);
}

function timestampFromHash(hash: string): string | null {
  const match = hash.match(/(?:^#|&|\?)t=([^&]+)/);
  return match?.[1] ?? null;
}

/** Supports 90, 90s, 1m30s, and 1h2m3s. */
export function parseTimestamp(raw: string): number {
  const value = decodeURIComponent(raw).trim().toLowerCase();
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  if (/^\d+s$/.test(value)) return Number(value.slice(0, -1));

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || (match[1] == null && match[2] == null && match[3] == null)) {
    return 0;
  }

  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("youtube-api"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

/** iOS ignores programmatic volume. Mute still works through the player API. */
export function supportsProgrammaticVolume(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return !iOSDevice && !iPadOs;
}
