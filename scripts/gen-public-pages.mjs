// Lists the site's own public pages (e.g. /privacy, /terms, /apps) for the sitemap. Runs before every build
// (npm "prebuild"), so a new public page appears in sitemap.xml without anyone adding it by hand.
// A page is left out if it's in a private area below, has a [dynamic] segment (those come from the database in
// app/sitemap.ts), or says it shouldn't be indexed (robots: { index: false } / noindex).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const APP = join(ROOT, "app");
const PRIVATE = new Set(["(app)", "(auth)", "admin", "api", "auth", "onboarding", "print", "suspended", "p", "pay", "q", "crew", "ticket", "tag", "club", "order"]);

const out = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const top = relative(APP, full).split(sep)[0];
      if (PRIVATE.has(top) || name.startsWith("[") || name.startsWith("_") || name.startsWith("@")) continue;
      walk(full);
    } else if (name === "page.tsx" || name === "page.ts" || name === "page.jsx" || name === "page.js") {
      const src = readFileSync(full, "utf8");
      if (/index:\s*false|noindex/.test(src)) continue;
      const path = "/" + relative(APP, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
      out.push(path === "/" ? "/" : path.replace(/\/$/, ""));
    }
  }
}
walk(APP);
out.sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
writeFileSync(join(ROOT, "lib", "public-pages.generated.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`public pages for the sitemap: ${out.join(", ")}`);
