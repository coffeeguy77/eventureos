/** Australian dollars for Business Sales screens (usable on the server and in the browser). */
export const aud = (n: number | null | undefined, cents = false) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }).format(n);
