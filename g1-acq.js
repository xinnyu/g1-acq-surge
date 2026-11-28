/* Google One combined 2TB / Pro 5TB / 20TB / 30TB / 100GB / 200GB mappings for Surge.
 *
 * Attribution & Credits:
 *   - Based on the open-source project `crhywun/g1-acq` (https://github.com/crhywun/g1-acq) by @crhywun
 *   - Ultra 20TB/30TB 1-month free trial mapping contributed by @cehomecambodia-lang (PR #3)
 *   - Extended in v8.0 with newly discovered 18-month / 15-month / 12-month / 9-month / 6-month $0 free trial
 *     and discount SKUs from exhaustive Google Play BillingClient catalog scanning, plus Safari interactive target switching.
 */
"use strict";

(function () {
  // Surge 可能把 body 交给脚本时是 Uint8Array；统一解码为字符串再匹配。
  function textBody(body) {
    if (typeof body === "string") return body;
    if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) {
      try { return new TextDecoder("utf-8").decode(body); } catch (e) {}
    }
    return body;
  }

  var VERSION = "g1-acq-v8.0";
  var SOURCE_PREFIX = "g1.ios.2tb.";
  var TARGET_OVERRIDE_KEY = "g1.target.override.v1";

  // Default target for 2TB / Pro 5TB: newly discovered 18-month $0 free trial (can be switched in Safari at https://one.google.com/g1-sku-report)
  var DEFAULT_TARGET = "g1.2tb.ai.18months_eft";

  // Priority chain for 2TB / Pro 5TB when auto-selecting from response body
  var PRO_CHAIN = [
    "g1.2tb.ai.18months_eft",
    "g1.2tb.ai.15months_eft",
    "g1.2tb.ai.12months_eft",
    "g1.2tb.ai.subs_variant",
    "g1.play.2tb.ai.student",
    "g1.2tb.ai.6months_eft",
    "g1.2tb.ai.4months_eft",
    "g1.2tb.ai.3months_eft",
    "g1.2tb.ai.2months_eft",
    "g1.2tb.1year_eft",
    "g1.2tb.6months_eft",
    "g1.2tb.ai.12months_ip_90p",
    "g1.2tb.ai.3months_ip_90p.acq",
    "g1.2tb.ai.1month_ip_95p.acq"
  ];

  var SKU_MAP = {
    "g1.ios.20tb.m.v2": "g1.20tb.1month_eft.acq",
    "g1.ios.30tb.ai.pro.m": "g1.ai.ultra.1month_eft.acq"
  };
  var FALLBACK = {
    "g1.20tb.1month_eft.acq": "g1.20tb.3months_ip_90p.acq",
    "g1.ai.ultra.1month_eft.acq": "g1.ai.ultra.3months_ip_90p.acq"
  };

  var TEST_KEY = "g1.pro.annual.test.v1";
  var SCAN_KEY = "g1.sku.scan.v1";
  var SCAN_LIMIT = 300;
  var RECENT_LIMIT = 10;
  var MAX_EVENT_COUNT = 9007199254740991;
  var url = typeof $request === "object" && $request ? $request.url : "";

  if (typeof url !== "string" || !/^https:\/\/one\.google\.com\//.test(url) ||
      /^https:\/\/one\.google\.com\/g1-sku-report\/?(?:\?|$)/.test(url)) {
    $done({});
    return;
  }

  var TARGET = DEFAULT_TARGET;
  try {
    if (typeof $persistentStore !== "undefined" && typeof $persistentStore.read === "function") {
      var customTarget = ($persistentStore.read(TARGET_OVERRIDE_KEY) || "").trim();
      if (/^g1\.[A-Za-z0-9._-]{2,120}$/.test(customTarget)) {
        TARGET = customTarget;
      }
    }
  } catch (e) {}

  var body = textBody(typeof $response === "object" && $response ? $response.body : undefined);
  try {
    collectOriginalSkus(body);
  } catch (error) {
    console.log("[g1-acq] SKU collection unavailable");
  }

  if (!/^https:\/\/one\.google\.com\/ai\?/.test(url)) {
    $done({});
    return;
  }

  var mappings = Object.create(null);
  var hits = 0;
  var annualHits = 0;
  var out = body;

  if (typeof body === "string") {
    var observed = body.match(/g1\.[a-z0-9._]{2,60}(?:acq|eft|90p|95p|subs_variant|student)/g) || [];
    out = body.replace(
      /(^|[^A-Za-z0-9._@%-])(g1\.[A-Za-z0-9._-]+)(?=$|[^A-Za-z0-9._-])/g,
      function (match, before, id) {
        var isAnnual = id.indexOf(SOURCE_PREFIX) === 0 && id.length > SOURCE_PREFIX.length;
        var to;
        var fallback = false;
        if (isAnnual) {
          to = TARGET;
        } else if (Object.prototype.hasOwnProperty.call(SKU_MAP, id)) {
          to = SKU_MAP[id];
          if (observed.indexOf(to) === -1 && FALLBACK[to] && observed.indexOf(FALLBACK[to]) !== -1) {
            to = FALLBACK[to];
            fallback = true;
          }
        } else {
          return match;
        }
        if (!mappings[id]) mappings[id] = { id: id, to: to, count: 0, fallback: fallback };
        mappings[id].count += 1;
        hits += 1;
        if (isAnnual) annualHits += 1;
        return before + to;
      }
    );
  }

  var sources = Object.keys(mappings).sort().map(function (id) {
    return mappings[id];
  });
  var record = {
    schemaVersion: 1,
    version: VERSION,
    updatedAt: new Date().toISOString(),
    sourcePrefix: SOURCE_PREFIX,
    target: TARGET,
    targetOrigin: "user-specified",
    hitCount: hits,
    annualHitCount: annualHits,
    matchedFrom: sources,
    status: typeof body !== "string" ? "non-text" : hits ? "rewritten" : "no-match"
  };

  try {
    if (typeof $persistentStore !== "undefined" &&
        typeof $persistentStore.write === "function") {
      if (!$persistentStore.write(JSON.stringify(record), TEST_KEY)) {
        console.log("[g1-acq] local record write failed");
      }
    }
  } catch (error) {
    console.log("[g1-acq] local record unavailable");
  }

  console.log("[g1-acq] " + VERSION + " target=" + TARGET + " hits=" + hits + " annualHits=" + annualHits);
  sources.forEach(function (source) {
    console.log("[g1-acq] " + source.id + " -> " + source.to + " x" + source.count +
      (source.fallback ? " fallback=" + source.to : ""));
  });
  $done(hits ? { body: out } : {});

  function collectOriginalSkus(originalBody) {
    var now = new Date().toISOString();
    var saved = {};
    try {
      if (typeof $persistentStore !== "undefined" && typeof $persistentStore.read === "function") {
        saved = JSON.parse($persistentStore.read(SCAN_KEY) || "{}");
      }
    } catch (error) {
      saved = {};
    }
    if (!saved || saved.schemaVersion !== 1) saved = {};

    var byId = Object.create(null);
    var ids = [];
    var validId = /^(?:g1\.|com\.google\.one\.)[A-Za-z0-9._-]{1,160}$/;
    var oldRows = Array.isArray(saved.skus) ? saved.skus : [];
    oldRows.slice(0, SCAN_LIMIT).forEach(function (row) {
      if (!row || typeof row.id !== "string" || !validId.test(row.id) || byId[row.id]) return;
      var count = Number(row.count);
      byId[row.id] = {
        id: row.id,
        count: isFinite(count) && count > 0 ? Math.floor(count) : 0,
        lastSeen: typeof row.lastSeen === "string" ? row.lastSeen.slice(0, 32) : ""
      };
      ids.push(row.id);
    });

    var isText = typeof originalBody === "string";
    var found = Object.create(null);
    var hitCount = 0;
    var addedCount = 0;
    var omittedCount = 0;
    var truncated = saved.truncated === true;
    if (isText) {
      var text = originalBody.replace(/\\u002e|\\x2e|&#0*46;|&#x0*2e;|&period;/gi, ".");
      var token = /(^|[^A-Za-z0-9._@%-])((?:g1\.|com\.google\.one\.)[A-Za-z0-9._-]+)(?=$|[^A-Za-z0-9._-])/g;
      var match;
      while ((match = token.exec(text)) !== null) {
        var id = match[2];
        if (!validId.test(id)) continue;
        found[id] = (found[id] || 0) + 1;
        hitCount += 1;
        if (!byId[id]) {
          if (ids.length >= SCAN_LIMIT) {
            truncated = true;
            if (found[id] === 1) omittedCount += 1;
            continue;
          }
          byId[id] = { id: id, count: 0, lastSeen: now };
          ids.push(id);
          addedCount += 1;
        }
        byId[id].count += 1;
        byId[id].lastSeen = now;
      }
    }

    var candidateCount = Object.keys(found).length;
    var bodyType = isText ? "text" : "non-text";
    var status = responseStatus(bodyType, candidateCount, addedCount, omittedCount);
    var recentResponses = [];
    var oldResponses = Array.isArray(saved.recentResponses) ? saved.recentResponses : [];
    oldResponses.slice(-RECENT_LIMIT).forEach(function (row) {
      var event = priorResponse(row);
      if (event) recentResponses.push(event);
    });
    recentResponses.push({
      at: now,
      path: safeRoute(url),
      bodyType: bodyType,
      status: status,
      candidateCount: candidateCount,
      addedCount: addedCount,
      omittedCount: omittedCount
    });

    function priorCount(value) {
      var number = Number(value);
      return isFinite(number) && number > 0 ? Math.floor(number) : 0;
    }
    var state = {
      schemaVersion: 1,
      version: VERSION,
      updatedAt: now,
      scannedResponses: priorCount(saved.scannedResponses) + (isText ? 1 : 0),
      matchedResponses: priorCount(saved.matchedResponses) + (hitCount > 0 ? 1 : 0),
      nonTextResponses: priorCount(saved.nonTextResponses) + (isText ? 0 : 1),
      recentResponses: recentResponses.slice(-RECENT_LIMIT),
      limit: SCAN_LIMIT,
      truncated: truncated,
      skus: ids.sort().map(function (id) { return byId[id]; })
    };
    var stored = false;
    try {
      if (typeof $persistentStore !== "undefined" && typeof $persistentStore.write === "function") {
        stored = $persistentStore.write(JSON.stringify(state), SCAN_KEY);
      }
    } catch (error) {
      stored = false;
    }

    console.log("[g1-acq] " + VERSION + " status=" + status + " addedCount=" + addedCount +
      " candidates=" + candidateCount + " omittedCount=" + omittedCount +
      " occurrences=" + hitCount + " saved=" + (stored ? "yes" : "no"));
  }

  function safeRoute(requestUrl) {
    var path = requestUrl.replace(/^https:\/\/one\.google\.com/, "").split(/[?#]/)[0];
    path = path.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/ai" || path === "/plans") return path;
    if (/^\/_\/[^?#]+\/data\/batchexecute$/.test(path)) return "/_/…/data/batchexecute";
    return "[其他 one.google.com 路径]";
  }

  function responseStatus(bodyType, candidateCount, addedCount, omittedCount) {
    if (bodyType === "non-text") return "non-text";
    if (addedCount > 0) return "new-skus";
    if (omittedCount > 0) return "limit-reached";
    return candidateCount > 0 ? "known-skus" : "no-skus";
  }

  function priorResponse(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    if (typeof row.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.at) ||
        !isFinite(Date.parse(row.at)) || new Date(row.at).toISOString() !== row.at) return null;
    if (row.path !== "/" && row.path !== "/ai" && row.path !== "/plans" &&
        row.path !== "/_/…/data/batchexecute" && row.path !== "[其他 one.google.com 路径]") return null;
    if (row.bodyType !== "text" && row.bodyType !== "non-text") return null;

    function counter(value, maximum) {
      if (typeof value !== "number" || !isFinite(value)) return null;
      return Math.max(0, Math.min(maximum, Math.floor(value)));
    }
    var candidateCount = counter(row.candidateCount, MAX_EVENT_COUNT);
    if (candidateCount === null) return null;
    var addedCount = counter(row.addedCount, Math.min(SCAN_LIMIT, candidateCount));
    if (addedCount === null) return null;
    var omittedCount = counter(row.omittedCount, candidateCount - addedCount);
    if (omittedCount === null) return null;
    if (row.bodyType === "non-text" && (candidateCount || addedCount || omittedCount)) return null;
    if (row.status !== responseStatus(row.bodyType, candidateCount, addedCount, omittedCount)) return null;
    return {
      at: row.at,
      path: row.path,
      bodyType: row.bodyType,
      status: row.status,
      candidateCount: candidateCount,
      addedCount: addedCount,
      omittedCount: omittedCount
    };
  }
})();
