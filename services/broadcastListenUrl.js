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

/**
 * Icecast mounts are the long-term listen URL. Until that box exists,
 * listeners play the current catalog track over the public HTTPS API
 * (same files the host already monitors locally).
 */
export function resolveListenUrl({
  icecastConfigured,
  mountListenUrl,
  trackId,
  audioUrl,
}) {
  if (icecastConfigured) {
    return mountListenUrl || null;
  }
  return catalogTrackListenUrl(trackId, audioUrl);
}
