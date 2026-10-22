import { test } from "node:test";
import assert from "node:assert/strict";
import { blocks, cleanPath, closest, inline, matchRule, normPath, readSite, routeFor, withTracking } from "./site";

const site = readSite({ site: {
  home: true, domain: "WWW.Example.com.au", live: true, fallback: true,
  pages: [{ slug: "about-us", title: "About us" }, { slug: "contact-us", title: "Contact" }, { slug: "hire", title: "taken" }],
  rules: [
    { from: "/coffee-cart-hire-canberra/", to: "/hire/coffee-cart-hire" },
    { from: "/product/*", to: "/shop/p/*" },
    { from: "/portfolio-item/*", to: "/" },
    { from: "/old-promo", status: 410 },
  ],
} });

test("settings: host cleaned, reserved page addresses refused", () => {
  assert.equal(site.domain, "www.example.com.au");
  assert.deepEqual(site.pages.map((p) => p.slug), ["about-us", "contact-us"]);
  assert.equal(readSite({ site: { domain: "beanculture.eventureos.com.au", live: true } }).live, false);
});

test("normPath", () => {
  assert.equal(normPath("/About-Us/"), "/about-us");
  assert.equal(normPath("/shop/index.php?x=1"), "/shop");
  assert.equal(normPath(""), "/");
});

test("rules: exact, starts-with carrying the rest, gone", () => {
  assert.equal(matchRule(site.rules, "/Coffee-Cart-Hire-Canberra")?.to, "/hire/coffee-cart-hire");
  assert.equal(matchRule(site.rules, "/product/night-owl-decaf/")?.to, "/shop/p/night-owl-decaf");
  assert.equal(matchRule(site.rules, "/product/")?.to, "/shop/p/");
  assert.equal(matchRule(site.rules, "/old-promo")?.status, 410);
  assert.equal(matchRule(site.rules, "/nothing"), null);
});

test("routing on the business's own domain", () => {
  assert.deepEqual(routeFor(site, "biz", "/"), { kind: "rewrite", to: "/site/biz" });
  assert.deepEqual(routeFor(site, "biz", "/about-us"), { kind: "rewrite", to: "/site/biz/about-us" });
  assert.deepEqual(routeFor(site, "biz", "/hire/catering"), { kind: "rewrite", to: "/hire/biz/catering" });
  assert.deepEqual(routeFor(site, "biz", "/hire"), { kind: "rewrite", to: "/hire/biz" });
  assert.deepEqual(routeFor(site, "biz", "/hire/biz/catering"), { kind: "pass" });
  assert.deepEqual(routeFor(site, "biz", "/classes"), { kind: "rewrite", to: "/biz" });
  assert.deepEqual(routeFor(site, "biz", "/_next/static/x.js"), { kind: "pass" });
  assert.deepEqual(routeFor(site, "biz", "/coffee-cart-hire-canberra/"), { kind: "redirect", to: "/hire/coffee-cart-hire", status: 301 });
  assert.deepEqual(routeFor(site, "biz", "/old-promo"), { kind: "gone" });
  assert.deepEqual(routeFor(site, "biz", "/wp-content/uploads/a.jpg"), { kind: "notfound", log: true });
  assert.deepEqual(routeFor(site, "biz", "/sitemap.xml"), { kind: "rewrite", to: "/api/site/sitemap?org=biz" });
  assert.equal((routeFor(site, "biz", "/about") as { to: string }).to, "/about-us"); // closest page by words
  assert.equal((routeFor(site, "biz", "/random-old-post") as { to: string }).to, "/");
});

test("closest, clean addresses and tracking tags", () => {
  assert.equal(closest(site, "/contact"), "/contact-us");
  assert.equal(cleanPath("biz", "/site/biz"), "/");
  assert.equal(cleanPath("biz", "/site/biz/about-us"), "/about-us");
  assert.equal(cleanPath("biz", "/hire/biz/coffee-cart-hire"), "/hire/coffee-cart-hire");
  assert.equal(cleanPath("biz", "/biz"), "/classes");
  assert.equal(cleanPath("biz", "/book/biz"), "/classes");
  assert.equal(cleanPath("biz", "/book/biz/home-barista"), "/book/home-barista");
  assert.equal(withTracking("/hire", "?utm_source=g&x=1&gclid=2"), "/hire?utm_source=g&gclid=2");
});

test("page text: headings, paragraphs, lists, bold and links", () => {
  const b = blocks("## Who you are\nLine one\nline two\n\n- a\n- b\n\nEnd");
  assert.deepEqual(b, [{ t: "h", text: "Who you are" }, { t: "p", text: "Line one line two" }, { t: "ul", items: ["a", "b"] }, { t: "p", text: "End" }]);
  assert.deepEqual(inline("Call **now** or [email](mailto:a@b.c)"), [{ t: "text", v: "Call " }, { t: "b", v: "now" }, { t: "text", v: " or " }, { t: "a", v: "email", href: "mailto:a@b.c" }]);
});

import { cleanRules, launchCheck, suggest } from "./seo";
test("SEO Saver: suggestions and launch check", () => {
  const s = readSite({ site: { home: true, pages: [{ slug: "about-us", title: "About us" }, { slug: "franchise", title: "Franchise" }], rules: [{ from: "/coffee-cart-hire-canberra", to: "/hire/coffee-cart-hire" }, { from: "/loop", to: "/coffee-cart-hire-canberra" }] } });
  const pages = [{ path: "/", title: "Home", group: "Home" }, { path: "/about-us", title: "About us", group: "Pages" }, { path: "/franchise", title: "Franchise", group: "Pages" },
    { path: "/hire/coffee-cart-hire", title: "Coffee cart hire", group: "Events" }, { path: "/hire/coffee-van-hire", title: "Coffee van hire", group: "Events" }, { path: "/shop", title: "Shop coffee beans", group: "Shop" },
    { path: "/book/gift", title: "Class gift certificates", group: "Classes" }, { path: "/classes", title: "Barista classes / courses", group: "Classes" }];
  const found = ["/coffee-van-hire-canberra/", "/franchise-canberra/", "/product/night-owl-decaf/", "/product/mystery/", "/product/barista-lesson-gift-card/", "/portfolio-item/test/", "/about-us/", "/coffee-cart-hire-canberra/"].map((path) => ({ path, title: "", source: "sitemap" }));
  const sug = Object.fromEntries(suggest(s, found, pages, { products: ["night-owl-decaf"] }).map((x) => [x.from, x.to]));
  assert.equal(sug["/coffee-van-hire-canberra"], "/hire/coffee-van-hire");
  assert.equal(sug["/franchise-canberra"], "/franchise");
  assert.equal(sug["/product/night-owl-decaf"], "/shop/p/night-owl-decaf");
  assert.equal(sug["/product/mystery"], "/shop");
  assert.equal(sug["/product/barista-lesson-gift-card"], "/book/gift");
  assert.equal(sug["/portfolio-item/test"], "/");
  assert.equal(sug["/about-us"], undefined); // same address on the new site
  assert.equal(sug["/coffee-cart-hire-canberra"], undefined); // already has a rule
  const lc = launchCheck(s, [...found, { path: "/loop", title: "", source: "x" }], pages);
  assert.equal(lc.checks.find((c) => c.from === "/loop")?.ok, false); // two hops
  assert.equal(lc.checks.find((c) => c.from === "/about-us")?.ok, true);
  assert.equal(cleanRules([{ id: "a", from: "/x", to: "/x", status: 301, note: "" }, { id: "b", from: "/y", to: "/", status: 301, note: "" }, { id: "c", from: "/y", to: "/z", status: 301, note: "" }]).map((r) => r.id).join(), "b");
});
