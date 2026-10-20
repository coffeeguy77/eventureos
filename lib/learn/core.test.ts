import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessWindow, addMonths, addonOffer, boardName, challengeFor, countDone, courseOffersAddon, courseOrder, earned, gradeMastery, hireSplit, liveAccess, masteryQuestions,
  moduleInOneDay, nextLesson, parseLesson, priceStory, rankFor, readLearnSettings, readQuiz, readRule,
} from "./core";
import { scoreRoast, simulateTick, createInitialState } from "./roast-sim";
import pack from "./packs/bean-culture.json";

test("settings: off by default, suggested prices, cleaned values", () => {
  const s = readLearnSettings({});
  assert.equal(s.enabled, false);
  assert.deepEqual(s.prices, { monthly: 14.99, yearly: 149.9, with_course: 74.95 });
  assert.equal(s.welcomeEmail, false);
  assert.equal(s.marketplace.enabled, false);
  const t = readLearnSettings({ learn: { enabled: true, prices: { monthly: "9.5", yearly: -3 }, addonCourseIds: ["x", "11111111-1111-1111-1111-111111111111"], accessMonths: 99 } });
  assert.equal(t.enabled, true);
  assert.equal(t.prices.monthly, 9.5);
  assert.equal(t.prices.yearly, 0);
  assert.deepEqual(t.addonCourseIds, ["11111111-1111-1111-1111-111111111111"]);
  assert.equal(t.accessMonths, 36);
});

test("price story: 2 months free, 50% off with a course", () => {
  const st = priceStory(readLearnSettings({}));
  assert.equal(st.monthsFree, 2);
  assert.equal(st.courseSavePct, 50);
  assert.equal(st.yearlySaving, 29.98);
});

test("add-on only when selling is on, and for the chosen courses", () => {
  const id = "11111111-1111-1111-1111-111111111111", other = "22222222-2222-2222-2222-222222222222";
  assert.equal(addonOffer({ learn: { enabled: false } }, id), null);
  assert.equal(addonOffer({ learn: { enabled: true } }, id)?.price, 74.95);
  const s = readLearnSettings({ learn: { enabled: true, addonCourseIds: [id] } });
  assert.equal(courseOffersAddon(s, id), true);
  assert.equal(courseOffersAddon(s, other), false);
  assert.equal(addonOffer({ learn: { enabled: true, plans: { with_course: false } } }, id), null);
});

test("access: live pass, new passes start when the current one ends", () => {
  const now = Date.parse("2026-10-21T00:00:00Z");
  const rows = [
    { id: "a", plan: "yearly" as const, status: "active", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z", renews: false },
    { id: "b", plan: "monthly" as const, status: "expired", starts_at: "2025-01-01T00:00:00Z", ends_at: "2025-02-01T00:00:00Z", renews: false },
  ];
  assert.equal(liveAccess(rows, now)?.id, "a");
  assert.equal(liveAccess([{ ...rows[0], ends_at: "2026-10-01T00:00:00Z" }], now), null);
  // A failed monthly payment keeps a week's grace
  assert.equal(liveAccess([{ ...rows[0], status: "payment_failed", ends_at: "2026-10-20T12:00:00Z" }], now)?.id, "a");
  assert.equal(liveAccess([{ ...rows[0], status: "payment_failed", ends_at: "2026-10-10T12:00:00Z" }], now), null);
  assert.equal(liveAccess([{ ...rows[0], status: "cancelled" }], now), null);
  const w = accessWindow("yearly", "2026-12-01T00:00:00.000Z", 12, new Date(now));
  assert.equal(w.starts_at, "2026-12-01T00:00:00.000Z");
  assert.equal(w.ends_at, "2027-12-01T00:00:00.000Z");
  assert.equal(accessWindow("monthly", null, 12, new Date("2026-01-31T00:00:00Z")).ends_at, "2026-02-28T00:00:00.000Z");
  assert.equal(addMonths("2026-03-31T10:00:00.000Z", 1), "2026-04-30T10:00:00.000Z");
});

test("rank from XP (Replit levels)", () => {
  const levels = pack.levels.map((l) => ({ number: l.number, title: l.title, min_xp: l.min_xp }));
  assert.equal(rankFor(levels, 0).current?.title, "Barista Basics");
  assert.equal(rankFor(levels, 0).next?.title, "Espresso Mastery");
  const r = rankFor(levels, 600);
  assert.equal(r.current?.title, "Milk & Latte Art");
  assert.equal(r.next?.title, "Specialty Coffee");
  assert.equal(r.toNext, 450);
  assert.equal(rankFor(levels, 5000).next, null);
});

test("quizzes: read, mastery grading at 80%", () => {
  assert.equal(readQuiz({ question: "Q", options: ["a"], correct_index: 0 }), null);
  assert.equal(readQuiz({ question: "Q", options: ["a", "b"], correct_index: 2 }), null);
  const q = readQuiz({ question: "Q", options: ["a", "b"], correct_index: 1, explanation: "because" });
  assert.equal(q?.correct_index, 1);
  const qs = masteryQuestions([{ id: "1", title: "A", quiz: q }, { id: "2", title: "B", quiz: null }, { id: "3", title: "C", quiz: q }, { id: "4", title: "D", quiz: q }, { id: "5", title: "E", quiz: q }, { id: "6", title: "F", quiz: q }]);
  assert.equal(qs.length, 5);
  assert.equal(gradeMastery(qs, [1, 1, 1, 1, 0]).passed, true);
  assert.equal(gradeMastery(qs, [1, 1, 1, 0, 0]).passed, false);
  assert.equal(gradeMastery([], []).passed, false);
});

test("badges", () => {
  const s = { lessons: 5, streak: 1, bestStreak: 3, levelsDone: ["2"], bestRoast: 9.2, challenges: 9, bestArt: 70, moduleInADay: false };
  assert.equal(earned(readRule({ kind: "lessons", value: 5 }), s), true);
  assert.equal(earned(readRule({ kind: "streak", value: 3 }), s), true);
  assert.equal(earned(readRule({ kind: "level", value: "2" }), s), true);
  assert.equal(earned(readRule({ kind: "roast", value: 9 }), s), true);
  assert.equal(earned(readRule({ kind: "challenges", value: 10 }), s), false);
  assert.equal(earned(readRule({ kind: "manual" }), s), false);
  assert.equal(earned(readRule({ kind: "nonsense" }), s), false);
  const done = new Map([["a", "2026-10-20T01:00:00Z"], ["b", "2026-10-20T05:00:00Z"], ["c", "2026-10-21T01:00:00Z"]]);
  assert.equal(moduleInOneDay([{ id: "m", lessonIds: ["a", "b"] }], done, "Australia/Sydney"), true);
  assert.equal(moduleInOneDay([{ id: "m", lessonIds: ["a", "c"] }], done, "Australia/Sydney"), false);
});

test("daily challenge rotates by day", () => {
  const list = ["a", "b", "c"];
  assert.equal(challengeFor(list, "2026-10-21"), challengeFor(list, "2026-10-21"));
  assert.notEqual(challengeFor(list, "2026-10-21"), challengeFor(list, "2026-10-22"));
  assert.equal(challengeFor([], "2026-10-21"), null);
});

test("lesson text: headings, lists, tables, quotes, code", () => {
  const b = parseLesson("## Title\n\nIntro **bold** text.\n\n### Sub\n\n- one\n- two\n\n1. first\nmore\n2. second\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> quoted\n>\n> again\n\n```\nPush — Pause\n```\n\n---\n");
  assert.deepEqual(b.map((x) => x.k), ["h2", "p", "h3", "ul", "ol", "table", "quote", "code", "hr"]);
  const p = b[1] as { k: "p"; text: { t: string; b?: boolean }[] };
  assert.deepEqual(p.text, [{ t: "Intro " }, { t: "bold", b: true }, { t: " text." }]);
  const ol = b[4] as { k: "ol"; items: { t: string }[][] };
  assert.equal(ol.items[0][0].t, "first — more");
  const t = b[5] as { k: "table"; head: string[]; rows: string[][] };
  assert.deepEqual(t.head, ["A", "B"]);
  assert.deepEqual(t.rows, [["1", "2"]]);
  // No raw HTML is ever produced: tags come through as plain text
  const x = parseLesson("<script>alert(1)</script>");
  assert.equal(x[0].k, "p");
});

test("the imported course is all there and every lesson parses", () => {
  assert.equal(pack.levels.length, 9);
  assert.equal(pack.modules.length, 39);
  assert.equal(pack.lessons.length, 127);
  assert.equal(pack.lessons.filter((l) => l.quiz).length, 44);
  const modKeys = new Set(pack.modules.map((m) => m.key));
  for (const l of pack.lessons) {
    assert.ok(modKeys.has(l.module_key), l.key);
    assert.ok(l.content.length > 50, l.key);
    assert.ok(parseLesson(l.content).length > 0, l.key);
    if (l.quiz) assert.ok(readQuiz(l.quiz), l.key);
  }
  // The angle brackets the copy tool hid are back
  assert.ok(pack.lessons.some((l) => l.content.includes("Too low (< 50 ppm)")));
  assert.equal(pack.trainer.filter((t) => t.kind === "theory").length, 40);
});

test("course order, next lesson, progress", () => {
  const c = {
    levels: [{ id: "L2", number: 2, position: 0, min_xp: 100 }, { id: "L1", number: 1, position: 0, min_xp: 0 }],
    modules: [{ id: "m1", level_id: "L1", position: 0 }, { id: "m2", level_id: "L1", position: 1 }, { id: "m3", level_id: "L2", position: 0 }],
    lessons: [{ id: "a", module_id: "m1", position: 0 }, { id: "b", module_id: "m1", position: 1 }, { id: "c", module_id: "m2", position: 0 }, { id: "d", module_id: "m3", position: 0 }],
  };
  assert.deepEqual(courseOrder(c).flat.map((f) => f.lessonId), ["a", "b", "c", "d"]);
  assert.equal(nextLesson(c, new Set(["a"]), 0, { access: true, freeModuleId: "m1" })?.lessonId, "b");
  assert.equal(nextLesson(c, new Set(["a", "b"]), 0, { access: false, freeModuleId: "m1" }), null);
  assert.equal(nextLesson(c, new Set(["a", "b", "c"]), 50, { access: true, freeModuleId: "m1" }), null);
  assert.equal(nextLesson(c, new Set(["a", "b", "c"]), 100, { access: true, freeModuleId: "m1" })?.lessonId, "d");
  assert.deepEqual(countDone(["a", "b"], new Set(["a"])), { done: 1, total: 2, pct: 50 });
});

test("marketplace split and leaderboard names", () => {
  assert.deepEqual(hireSplit(200, 15), { amount: 200, commission: 30, venue: 170 });
  assert.deepEqual(hireSplit(99.99, 20), { amount: 99.99, commission: 20, venue: 79.99 });
  assert.equal(boardName(null, "Shaun Matthews"), "Shaun M.");
  assert.equal(boardName("  ", "Cher"), "Cher");
  assert.equal(boardName("Bean Boss", "Shaun Matthews"), "Bean Boss");
});

test("roast simulator (moved as-is) still roasts and scores", () => {
  let s = { ...createInitialState(), gas: 80, isRunning: true };
  for (let i = 0; i < 900 && s.firstCrackTime === null; i++) {
    if (s.turningPointReached && s.bt > 165) s = { ...s, gas: 55 };
    s = simulateTick(s);
  }
  assert.ok(s.turningPointReached, "turning point");
  assert.ok(s.firstCrackTime !== null, "first crack");
  for (let i = 0; i < 90; i++) s = simulateTick({ ...s, gas: 25, airflow: 70 });
  const score = scoreRoast(s.history, s.firstCrackTime, s.time);
  assert.ok(score >= 1 && score <= 10);
});
