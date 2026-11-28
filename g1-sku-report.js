/* Local-only report & interactive SKU switcher served by a Surge http-request script.
 *
 * Attribution & Credits:
 *   - Based on `crhywun/g1-acq` (https://github.com/crhywun/g1-acq) by @crhywun
 *   - Extended in v8.0.0 with interactive 1-tap Safari target SKU switching & newly discovered 18M/15M/12M/6M/1Y free trial SKUs.
 */
"use strict";

(function () {
  var ROOT = "https://one.google.com/g1-sku-report";
  var VERSION = "v8.0.0";
  var COLLECTOR_VERSION = "g1-acq-v8.0";
  var DEFAULT_TARGET = "g1.2tb.ai.18months_eft";
  var TARGET_OVERRIDE_KEY = "g1.target.override.v1";
  var LEGACY_TARGET = "g1.2tb.ai.annual";
  var SCAN_KEY = "g1.sku.scan.v1";
  var TEST_KEY = "g1.pro.annual.test.v1";

  var PRESET_SKUS = [
    { sku: "g1.2tb.ai.18months_eft", label: "★ Pro 5TB · 18个月 $0 免费试用 (eft-18months)", tag: "FREE 18M" },
    { sku: "g1.2tb.ai.15months_eft", label: "★ Pro 5TB · 15个月 $0 免费试用 (eft-15months)", tag: "FREE 15M" },
    { sku: "g1.2tb.ai.12months_eft", label: "★ Pro 5TB · 12个月 $0 免费试用 (eft-12months)", tag: "FREE 12M" },
    { sku: "g1.2tb.ai.subs_variant", label: "Pro 5TB · 12个月/6个月 $0 免费试用变体 (subs_variant)", tag: "FREE 12M/6M" },
    { sku: "g1.play.2tb.ai.student", label: "★ Pro 5TB · 学生通道 12个月 $0 免费试用 (eft-12mo)", tag: "FREE 12M" },
    { sku: "g1.2tb.ai.6months_eft", label: "Pro 5TB · 6个月 $0 免费试用 (eft-6months)", tag: "FREE 6M" },
    { sku: "g1.2tb.ai.4months_eft", label: "Pro 5TB · 4个月 $0 免费试用 (eft-4months)", tag: "FREE 4M" },
    { sku: "g1.2tb.ai.3months_eft", label: "Pro 5TB · 3个月 $0 免费试用 (eft-3months)", tag: "FREE 3M" },
    { sku: "g1.2tb.ai.2months_eft", label: "Pro 5TB · 2个月 $0 免费试用 (eft-2months)", tag: "FREE 2M" },
    { sku: "g1.2tb.ai.12months_ip_90p", label: "Pro 5TB · 12个月 1折优惠 ($1.99/月 × 12 = $23.88)", tag: "$1.99×12M" },
    { sku: "g1.2tb.ai.3months_ip_90p.acq", label: "Pro 5TB · 3个月 1折优惠 ($1.99/月 × 3)", tag: "$1.99×3M" },
    { sku: "g1.2tb.ai.1month_ip_95p.acq", label: "Pro 5TB · 1个月 0.5折优惠 ($0.99/首月)", tag: "$0.99×1M" },
    { sku: "g1.2tb.1year_eft", label: "★ AI Plus 2TB · 12个月 $0 免费试用 (1year_eft)", tag: "FREE 12M" },
    { sku: "g1.2tb.6months_eft", label: "AI Plus 2TB · 6个月 $0 免费试用 (6months_eft)", tag: "FREE 6M" },
    { sku: "g1.2tb.subs_variant", label: "AI Plus 2TB · 6个月/3个月 $0 免费试用变体", tag: "FREE 6M/3M" },
    { sku: "g1.play.helium", label: "★ AI Plus 400GB · 12个月 $0 免费试用 (eft-12mo)", tag: "FREE 12M" },
    { sku: "g1.play.helium.student", label: "AI Plus 400GB · 学生 12个月 $0 免费试用", tag: "FREE 12M" },
    { sku: "g1.helium.12months_ip_90p", label: "AI Plus 400GB · 12个月 1折 ($0.49/月 × 12 = $5.88/年)", tag: "$0.49×12M" },
    { sku: "g1.100gb.1year_eft", label: "★ 100GB 存储 · 12个月 $0 免费试用 (1year_eft)", tag: "FREE 12M" },
    { sku: "g1.100gb.9months_eft", label: "★ 100GB 存储 · 9个月 $0 免费试用 (9months_eft)", tag: "FREE 9M" },
    { sku: "g1.200gb.1year_eft", label: "★ 200GB 存储 · 12个月 $0 免费试用 (1year_eft)", tag: "FREE 12M" }
  ];

  var url = typeof $request === "object" && $request ? $request.url : "";
  if (typeof url !== "string" || !/^https:\/\/one\.google\.com\/g1-sku-report\/?(?:\?|$)/.test(url)) {
    $done({});
    return;
  }

  var storageAvailable = typeof $persistentStore !== "undefined" &&
    typeof $persistentStore.read === "function";
  var clearMessage = "";

  // Handle interactive target switching via ?set_target=<sku>
  var targetMatch = /(?:\?|&)set_target=([A-Za-z0-9._-]+)(?:&|$)/.exec(url);
  if (targetMatch && storageAvailable) {
    var newTarget = decodeURIComponent(targetMatch[1]);
    if (/^g1\.[A-Za-z0-9._-]{2,120}$/.test(newTarget)) {
      try {
        var okWrite = $persistentStore.write(newTarget, TARGET_OVERRIDE_KEY);
        clearMessage = okWrite ? ("✅ 已将 2TB/Pro 默认改写目标切换为：" + newTarget + "（请返回 Google App 重新进入方案页触发改写）") : "目标切换写入失败。";
      } catch (e) {
        clearMessage = "本地存储接口暂未就绪。";
      }
    }
  }

  if (/(?:\?|&)clear=1(?:&|$)/.test(url)) {
    try {
      var scanCleared = $persistentStore.write("{}", SCAN_KEY);
      var testCleared = $persistentStore.write("{}", TEST_KEY);
      clearMessage = scanCleared && testCleared ? "本工具的两份本地记录已清空。" : "本地记录清空未完成。";
    } catch (error) {
      clearMessage = "本地存储接口暂未就绪。";
    }
  }

  var CONFIGURED_TARGET = DEFAULT_TARGET;
  if (storageAvailable) {
    try {
      var custom = ($persistentStore.read(TARGET_OVERRIDE_KEY) || "").trim();
      if (/^g1\.[A-Za-z0-9._-]{2,120}$/.test(custom)) {
        CONFIGURED_TARGET = custom;
      }
    } catch (e) {}
  }

  function load(key) {
    if (!storageAvailable) return {};
    try {
      var value = JSON.parse($persistentStore.read(key) || "{}");
      return value && value.schemaVersion === 1 ? value : {};
    } catch (error) {
      return {};
    }
  }
  function text(value, length) {
    return typeof value === "string" ? value.slice(0, length || 180) : "";
  }
  function count(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }
  function sku(value) {
    return typeof value === "string" && /^g1\.[A-Za-z0-9._-]{1,160}$/.test(value) ? value : "";
  }
  function rows(value, withTime, defaultTarget) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 300).filter(function (row) {
      return row && typeof row.id === "string" &&
        /^(?:g1\.|com\.google\.one\.)[A-Za-z0-9._-]{1,160}$/.test(row.id);
    }).map(function (row) {
      var out = { id: row.id, count: count(row.count) };
      if (withTime) {
        out.lastSeen = text(row.lastSeen, 32);
      } else {
        out.to = sku(row.to) || (row.id.indexOf("g1.ios.2tb.") === 0 ? defaultTarget || "" : "");
        out.fallback = row.fallback === true;
      }
      return out;
    }).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }

  var scanStatuses = {
    "new-skus": "发现并录入新编号",
    "known-skus": "收到响应，编号与已有记录重复",
    "no-skus": "收到文本响应，本次没有商品编号",
    "limit-reached": "收到新编号，已达采集容量上限",
    "non-text": "收到响应，正文不是可扫描文本"
  };
  var scanPaths = ["/", "/ai", "/plans", "/_/…/data/batchexecute", "[其他 one.google.com 路径]"];
  function recent(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(-10).filter(function (event) {
      return event && typeof event.at === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.at) &&
        (event.bodyType === "text" || event.bodyType === "non-text") &&
        Object.prototype.hasOwnProperty.call(scanStatuses, event.status);
    }).map(function (event) {
      return {
        at: event.at,
        path: scanPaths.indexOf(event.path) !== -1 ? event.path : "[其他 one.google.com 路径]",
        bodyType: event.bodyType,
        status: event.status,
        candidateCount: count(event.candidateCount),
        addedCount: count(event.addedCount),
        omittedCount: count(event.omittedCount)
      };
    });
  }

  var scanRaw = load(SCAN_KEY);
  var testRaw = load(TEST_KEY);
  var recordedTarget = sku(testRaw.target);
  if (!recordedTarget && /^(?:pro-annual-test-v[12]|g1-acq-v7(?:\.0|\.1)?)$/.test(testRaw.version || "")) {
    recordedTarget = LEGACY_TARGET;
  }
  var matchedFrom = rows(testRaw.matchedFrom, false, recordedTarget);
  if (!recordedTarget) {
    matchedFrom.some(function (row) {
      if (row.id.indexOf("g1.ios.2tb.") === 0 && row.to) {
        recordedTarget = row.to;
        return true;
      }
      return false;
    });
  }
  var annualHitCount = typeof testRaw.annualHitCount === "number" ? count(testRaw.annualHitCount) :
    matchedFrom.reduce(function (total, row) {
      return total + (row.id.indexOf("g1.ios.2tb.") === 0 ? row.count : 0);
    }, 0);
  var storedOrigin = text(testRaw.targetOrigin, 32);
  var targetOrigin = recordedTarget && /^(?:user-specified|pattern-derived|legacy)$/.test(storedOrigin) ?
    storedOrigin : recordedTarget === CONFIGURED_TARGET ? "user-specified" :
      recordedTarget === LEGACY_TARGET ? "legacy" : "";
  var report = {
    schemaVersion: 1,
    reportVersion: VERSION,
    configuredTarget: CONFIGURED_TARGET,
    storageAvailable: storageAvailable,
    scan: {
      version: text(scanRaw.version, 32),
      updatedAt: text(scanRaw.updatedAt, 32),
      scannedResponses: count(scanRaw.scannedResponses),
      matchedResponses: count(scanRaw.matchedResponses),
      nonTextResponses: count(scanRaw.nonTextResponses),
      recentResponses: recent(scanRaw.recentResponses),
      truncated: scanRaw.truncated === true,
      limit: 300,
      skus: rows(scanRaw.skus, true)
    },
    test: {
      version: text(testRaw.version, 32),
      updatedAt: text(testRaw.updatedAt, 32),
      sourcePrefix: "g1.ios.2tb.",
      target: recordedTarget,
      targetOrigin: targetOrigin,
      status: text(testRaw.status, 32),
      hitCount: count(testRaw.hitCount),
      annualHitCount: annualHitCount,
      matchedFrom: matchedFrom
    }
  };

  var headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-G1-Report-Version": VERSION,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
  };
  var exportJSON = /(?:\?|&)format=json(?:&|$)/.test(url);
  if (exportJSON) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    headers["Content-Disposition"] = 'attachment; filename="g1-sku-report.json"';
    $done({ response: { status: 200, headers: headers, body: JSON.stringify(report, null, 2) } });
    return;
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function fallbackName(row) {
    if (!row.fallback) return "否";
    var discount = /_ip_(\d+p)\.acq$/.exec(row.to || "");
    return discount ? discount[1] : "是";
  }
  function table(items, withTime) {
    if (!items.length) return "<p>暂无记录。</p>";
    return "<div class=scroll><table><thead><tr><th>完整商品编号</th><th>次数</th>" +
      (withTime ? "<th>最近发现时间（UTC）</th>" : "<th>实际目标 SKU</th><th>备用档</th>") + "</tr></thead><tbody>" +
      items.map(function (row) {
        return "<tr><td><code>" + escape(row.id) + "</code></td><td>" + row.count + "</td>" +
          (withTime ? "<td>" + escape(row.lastSeen) + "</td>" :
            "<td><code>" + escape(row.to || "未记录") + "</code></td><td>" + fallbackName(row) + "</td>") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }
  function recentTable(events) {
    if (!events.length) return "<p>尚无逐次响应记录；旧版采集数据没有这项诊断。</p>";
    return "<div class=scroll><table><thead><tr><th>时间（UTC）</th><th>路径分类</th><th>本次结果</th><th>识别编号</th><th>新增录入</th><th>容量外编号</th></tr></thead><tbody>" +
      events.slice().reverse().map(function (event) {
        return "<tr><td>" + escape(event.at) + "</td><td>" + escape(event.path) +
          "</td><td>" + scanStatuses[event.status] + "</td><td>" + event.candidateCount +
          "</td><td>" + event.addedCount + "</td><td>" + event.omittedCount + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function presetTable() {
    return "<div class=scroll><table><thead><tr><th>标签</th><th>隐藏 SKU (Product ID)</th><th>说明</th><th>操作</th></tr></thead><tbody>" +
      PRESET_SKUS.map(function (item) {
        var active = item.sku === CONFIGURED_TARGET;
        return "<tr" + (active ? " style=\"background:#eef8f2\"" : "") + "><td><strong>" + escape(item.tag) + "</strong></td><td><code>" + escape(item.sku) + "</code></td><td>" + escape(item.label) + "</td><td>" +
          (active ? "<span class=badge>当前已启用</span>" : "<a href=\"" + ROOT + "?set_target=" + encodeURIComponent(item.sku) + "\">一键切换</a>") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  var latestScan = report.scan.recentResponses.length ?
    report.scan.recentResponses[report.scan.recentResponses.length - 1] : null;
  var scanVersionStatus = report.scan.version === COLLECTOR_VERSION ?
    "记录来自本版采集脚本；按响应时间与计数判断是否产生了新记录。" :
    report.scan.version ? "旧采集记录；尚未保存本版采集响应记录。" : "尚未保存本版采集响应记录。";
  var statuses = {
    "rewritten": "已执行字符串替换",
    "no-match": "本次响应未命中三档映射中的源商品",
    "non-text": "本次响应没有可处理的文本正文"
  };
  var status = Object.prototype.hasOwnProperty.call(statuses, report.test.status) ?
    statuses[report.test.status] : "暂无测试执行记录";
  var html = [
    "<!doctype html><html lang=zh-CN><meta charset=utf-8>",
    "<meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Google One SKU 本地控制台 & 报告</title>",
    "<style>body{font:16px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;max-width:960px;margin:24px auto;padding:0 18px;color:#1c2737;background:#f5f7fa}section{background:white;border:1px solid #dde3ec;border-radius:12px;padding:18px;margin:18px 0}h1{font-size:24px;margin-bottom:10px}h2{font-size:20px}code{overflow-wrap:anywhere}a{color:#1259be}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.scroll{overflow:auto}.note{color:#46556b}.badge{display:inline-block;background:#e0f4e8;color:#176238;padding:4px 10px;border-radius:8px}.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:20px 0}.actions form{margin:0}button,.actions a{font:inherit;padding:10px 16px;border:0;border-radius:8px;cursor:pointer;text-decoration:none}.actions a{background:#e4eaf3}.actions button{background:#1259be;color:white}button{background:#e4eaf3;color:#1c2737}</style>",
    "<h1>Google One iOS / Surge 隐藏 SKU 本地控制台 & 报告</h1>",
    "<p class=badge>本机脚本已接管 · " + VERSION + "</p>",
    "<nav class=actions aria-label=报告操作><form method=get action=\"" + ROOT + "\"><button type=submit name=format value=json>导出 JSON</button></form><a href=\"" + ROOT + "\">刷新报告</a></nav>",
    clearMessage ? "<p style=\"background:#fff8db;padding:12px;border-radius:8px;border:1px solid #e6d087\">" + escape(clearMessage) + "</p>" : "",
    "<section><h2>一键切换 2TB / Pro 5TB 隐藏目标 SKU</h2>",
    "<p>当前生效的 <code>g1.ios.2tb.*</code> 改写目标：<code><strong>" + escape(CONFIGURED_TARGET) + "</strong></code></p>",
    "<p class=note>点击下方任意行的「一键切换」即可在手机本地切换目标 SKU，无需修改脚本；切换后重新进入 Google App → Google One 管理页即可触发新 SKU 改写。Ultra 20TB / 30TB 自动保持 <code>g1.20tb.1month_eft.acq</code> / <code>g1.ai.ultra.1month_eft.acq</code>（自动回退 90p 1折）。</p>",
    presetTable(), "</section>",
    "<section><h2>最近一次三档映射</h2>",
    "<p>版本：" + escape(report.test.version || "暂无") + "<br>状态：" + escape(status) + "；总替换次数：" + report.test.hitCount + "；其中 2TB/Pro：" + report.test.annualHitCount + "</p>",
    "<p>2TB 源前缀：<code>g1.ios.2tb.</code><br>该次记录的 2TB 目标：<code>" + escape(report.test.target || "暂无记录") + "</code><br>执行时间（UTC）：" + escape(report.test.updatedAt || "暂无") + "</p>",
    table(report.test.matchedFrom, false), "</section>",
    "<section><h2>采集运行记录</h2>",
    "<p>实际采集脚本：<code>" + escape(report.scan.version || "暂无记录") + "</code><br>" + scanVersionStatus + "</p>",
    "<p>已扫描文本响应：" + report.scan.scannedResponses + "；已记录非文本响应：" + report.scan.nonTextResponses +
      "；含商品编号的响应：" + report.scan.matchedResponses + "；累计编号：" + report.scan.skus.length + "</p>",
    "<h3>最近 10 次响应</h3>", recentTable(report.scan.recentResponses), "</section>",
    "<section><h2>浏览页面时采集到的候选 SKU</h2>",
    table(report.scan.skus, true), "</section>",
    "<form method=get action=\"" + ROOT + "\"><button name=clear value=1>清空本工具的采集与测试记录</button></form>",
    "<p class=note>开源致谢：本项目基于 <a href=\"https://github.com/crhywun/g1-acq\">crhywun/g1-acq</a> 与 PR #3 (@cehomecambodia-lang) 扩展构建。</p></html>"
  ].join("");
  $done({ response: { status: 200, headers: headers, body: html } });
})();
