/** @format */

function parseRange(header, size) {
  const match = String(header || "").match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  let start = match[1] === "" ? null : Number(match[1]);
  let end = match[2] === "" ? null : Number(match[2]);
  if (start == null && end == null) return null;
  if (start == null) {
    start = Math.max(size - end, 0);
    end = size - 1;
  } else if (end == null || end >= size) {
    end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  return { start, end };
}

export function sendAudioFile(req, res, buffer, contentType = "audio/mpeg") {
  const size = buffer.length;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const range = parseRange(req.headers.range, size);
  if (req.headers.range && !range) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${size}`);
    return res.end();
  }

  if (range) {
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
    if (req.method === "HEAD") return res.end();
    return res.end(buffer.subarray(range.start, range.end + 1));
  }

  res.setHeader("Content-Length", size);
  if (req.method === "HEAD") return res.end();
  return res.end(buffer);
}
