/**
 * Shown the moment you tap a menu item or tab, while the page is fetched — so the app answers straight away instead
 * of sitting still until the server has finished. Theme tokens only (reads the same in dark mode).
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="mb-2 h-7 w-48 rounded-md bg-line" />
      <div className="mb-6 h-4 w-72 max-w-full rounded bg-line/70" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl bg-surface p-5 ring-1 ring-line">
            <div className="mb-3 h-4 w-40 rounded bg-line" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-line/70" />
              <div className="h-3 w-5/6 rounded bg-line/70" />
              <div className="h-3 w-2/3 rounded bg-line/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
