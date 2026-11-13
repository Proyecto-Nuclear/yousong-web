/**
 * Thumbnails come from the backend, which copies them from the YouTube Data API. The panel only loads them from
 * YouTube's own image hosts over HTTPS, with no credentials or custom port, so a tampered response cannot make
 * the owner's browser contact an arbitrary server.
 */
const YOUTUBE_IMAGE_HOST = /^(i\d?\.ytimg\.com|img\.youtube\.com)$/;

export function safeThumbnailUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !YOUTUBE_IMAGE_HOST.test(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
