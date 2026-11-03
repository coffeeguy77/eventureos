import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHost } from "./host-detect";

test("SiteGround from its plugins", () => {
  assert.equal(detectHost([{ file: "sg-security/sg-security.php", name: "Security Optimizer" }]), "siteground");
  assert.equal(detectHost([{ file: "sg-cachepress/sg-cachepress.php", name: "Speed Optimizer" }]), "siteground");
  assert.equal(detectHost([{ file: "akismet/akismet.php", name: "Akismet" }]), null);
  assert.equal(detectHost(null), null);
});
