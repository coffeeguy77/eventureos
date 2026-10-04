/*!
 * EventureOS booking widget — https://www.eventureos.com.au
 * Put this where the booking form should appear:
 *   <div data-eventureos-book="your-business" data-course="optional-course-slug"></div>
 *   <script src="https://www.eventureos.com.au/embed.js" async></script>
 * Options (data- attributes): data-course, data-page="gift", data-session, data-min-height
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var ORIGIN = (function () {
    try { return new URL(script && script.src ? script.src : "https://www.eventureos.com.au/embed.js").origin; } catch (e) { return "https://www.eventureos.com.au"; }
  })();
  var frames = [];

  function build(el) {
    if (el.getAttribute("data-eventureos-ready")) return;
    var org = el.getAttribute("data-eventureos-book");
    if (!org || !/^[a-z0-9-]+$/.test(org)) return;
    el.setAttribute("data-eventureos-ready", "1");
    var course = el.getAttribute("data-course");
    var page = el.getAttribute("data-page");
    var path = "/book/" + org + (page === "gift" ? "/gift" : course && /^[a-z0-9-]+$/.test(course) ? "/" + course : "");
    var q = new URLSearchParams();
    q.set("embed", "1");
    q.set("source", "wordpress");
    var session = el.getAttribute("data-session");
    if (session) q.set("session", session);
    // Pass campaign tags through (Facebook / Instagram / QR links to the website)
    var here = new URLSearchParams(window.location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "session"].forEach(function (k) { if (here.get(k)) q.set(k, here.get(k)); });
    if (!q.get("utm_source")) { q.set("utm_source", window.location.hostname); q.set("utm_medium", "widget"); }
    var f = document.createElement("iframe");
    f.src = ORIGIN + path + "?" + q.toString();
    f.title = "Book online";
    f.loading = "lazy";
    f.setAttribute("allow", "payment *; clipboard-write");
    f.style.cssText = "display:block;width:100%;border:0;overflow:hidden;background:transparent;min-height:" + (parseInt(el.getAttribute("data-min-height") || "640", 10)) + "px;transition:height .15s ease";
    f.setAttribute("scrolling", "no");
    el.innerHTML = "";
    el.appendChild(f);
    frames.push(f);
  }

  function all() {
    var list = document.querySelectorAll("[data-eventureos-book]");
    for (var i = 0; i < list.length; i++) build(list[i]);
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data !== "object") return;
    var f = null;
    for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === e.source) f = frames[i];
    if (!f) return;
    if (e.data.type === "eventureos:height" && typeof e.data.height === "number") {
      f.style.height = Math.max(200, Math.min(20000, e.data.height)) + "px";
    } else if (e.data.type === "eventureos:navigate" && typeof e.data.url === "string") {
      // Only to Stripe's payment page or back to EventureOS
      try {
        var u = new URL(e.data.url);
        if (u.origin === ORIGIN || u.hostname === "checkout.stripe.com") window.location.href = u.toString();
      } catch (err) { /* ignore */ }
    } else if (e.data.type === "eventureos:scrollTop") {
      var top = f.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: top, behavior: "smooth" });
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", all); else all();
  // Page builders that add content later
  if ("MutationObserver" in window) new MutationObserver(all).observe(document.documentElement, { childList: true, subtree: true });
})();
