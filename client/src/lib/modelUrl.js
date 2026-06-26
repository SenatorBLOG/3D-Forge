// External http(s) model URLs (e.g. Meshy's assets.meshy.ai GLBs) can't be
// fetched by the browser directly — no CORS headers. Route them through our
// same-origin server proxy. Local paths (/models/..) and blob: object URLs
// (uploaded files) are returned unchanged.
export function toLoadableUrl(url) {
  if (typeof url !== 'string') return url
  return /^https?:\/\//i.test(url) ? `/api/models/proxy?url=${encodeURIComponent(url)}` : url
}
