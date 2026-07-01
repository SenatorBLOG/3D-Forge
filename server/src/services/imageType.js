// Sniff a raster image's type from its leading "magic" bytes. We don't trust the
// Content-Type header (the upload route sends raw bytes), so this is the gate that
// keeps non-images out of the reference store. Returns { ext, mime } or null.

export function detectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' }
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  // GIF: "GIF87a" / "GIF89a"
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') {
    return { ext: 'gif', mime: 'image/gif' }
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}
