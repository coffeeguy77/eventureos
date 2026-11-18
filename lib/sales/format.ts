/** Australian dollars for Business Sales screens (usable on the server and in the browser). */
export const aud = (n: number | null | undefined, cents = false) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }).format(n);

/** A small Cloudinary rendition for thumbnails (the panoramas themselves are large); other addresses unchanged. */
export function thumb(url: string, w = 256, h = 160): string {
  return /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url) ? url.replace("/image/upload/", `/image/upload/w_${w},h_${h},c_fill,q_auto,f_auto/`) : url;
}
