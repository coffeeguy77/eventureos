import localFont from "next/font/local";

/** Instrument Serif (SIL OFL, see fonts/LICENSE) — the high-contrast display serif that echoes the EventureOS wordmark. */
export const mkSerif = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-mk-serif",
  display: "swap",
});
