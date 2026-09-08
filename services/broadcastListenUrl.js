/** @format */

export function publicApiBase() {
  return (process.env.PUBLIC_API_BASE_URL || "https://assyncs.com").replace(/\/$/, "");
}

export function toPublicHttpsUrl(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/^https?:\/\/(?:www\.)?assyncs\.com(?::\d+)?(\/.*)?$/i);
  if (match) {
    return `https://assyncs.com${match[1] || ""}`;
  }
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${publicApiBase()}${url}`;
  return null;
}

export function catalogTrackListenUrl(trackId, audioUrl) {
  const fromAudio = toPublicHttpsUrl(audioUrl);
  if (fromAudio) return fromAudio;
  if (trackId == null || trackId === "") return null;
  return `${publicApiBase()}/api/music/tracks/${trackId}`;
}

export function broadcastListenPath(broadcastId, trackId) {
  if (broadcastId == null || broadcastId === "" || trackId == null || trackId === "") {
    return null;
  }
  return `${publicApiBase()}/api/broadcasts/${broadcastId}/listen.mp3?t=${trackId}`;
}

/**
 * Icecast mounts are the long-term listen URL. Until that box exists,
 * listeners play through /listen.mp3 so the player gets audio/mpeg,
 * a .mp3 path, and HTTP Range — the catalog /tracks/:id route currently
 * advertises image/jpeg + nosniff, which iOS AVPlayer rejects.
 */
export function resolveListenUrl({
  icecastConfigured,
  mountListenUrl,
  broadcastId,
  trackId,
  audioUrl,
}) {
  if (icecastConfigured) {
    return mountListenUrl || null;
  }
  return (
    broadcastListenPath(broadcastId, trackId) || catalogTrackListenUrl(trackId, audioUrl)
  );
}
