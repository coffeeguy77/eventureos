import { test } from "node:test";
import assert from "node:assert/strict";
import { footerPageKey, footerToneFor } from "./footer-tone";
import { applyEdits } from "./copy";

test("keys pages by their address without the business name", () => {
    assert.equal(footerPageKey("/cafe/beanculture/roasting-club", "beanculture"), "cafe-roasting-club");
    assert.equal(footerPageKey("/beanculture", "beanculture"), "home");
    assert.equal(footerPageKey("/site/beanculture/About_Us?x=1", "beanculture"), "site-about-us");
  });
test("defaults to dark and reads a saved choice", () => {
    assert.equal(footerToneFor({}, "shop"), "dark");
    assert.equal(footerToneFor({ site: { footerTone: { shop: "light" } } }, "shop"), "light");
  });
test("saves only dark or light from the page editor", () => {
    assert.equal((applyEdits({}, [{ path: "site.footerTone.cafe-roasting-club", value: "light" }]) as { site: { footerTone: Record<string, string> } }).site.footerTone["cafe-roasting-club"], "light");
    assert.throws(() => applyEdits({}, [{ path: "site.footerTone.shop", value: "red" }]));
  });

