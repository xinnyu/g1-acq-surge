"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const TARGET = "g1.2tb.ai.12months_ip_90p";
const TWENTY = "g1.ios.20tb.m.v2";
const THIRTY = "g1.ios.30tb.ai.pro.m";
const source = Object.fromEntries(
  ["g1-acq.js", "g1-sku-report.js"].map((name) => [name, fs.readFileSync(path.join(root, name), "utf8")])
);

function run(name, options = {}) {
  const storage = options.storage || new Map();
  const calls = [];
  const context = {
    $request: { url: options.url || "https://one.google.com/ai?fixture=1" },
    $response: { body: options.body },
    $done: (payload) => calls.push(JSON.parse(JSON.stringify(payload))),
    console: { log() {} },
    TextDecoder,
    Uint8Array,
    $persistentStore: {
      read: (key) => storage.get(key) || null,
      write: (value, key) => {
        storage.set(key, value);
        return true;
      }
    }
  };
  vm.runInNewContext(source[name], context, { timeout: 2000, filename: name });
  assert.equal(calls.length, 1);
  return { payload: calls[0], storage };
}

test("rewrites the three tiers on /ai and leaves other tokens", () => {
  const body = [
    "plan g1.ios.2tb.fixture_monthly end",
    TWENTY,
    THIRTY,
    "g1.ios.12tb.fixture",
    TWENTY + ".extra"
  ].join(" ");
  const { payload } = run("g1-acq.js", { body });
  assert.match(payload.body, new RegExp("plan " + TARGET + " end"));
  assert.match(payload.body, /g1\.ai\.ultra\.1month_eft\.acq/);
  assert.match(payload.body, /g1\.ai\.ultra\.3months_ip_90p\.acq/);
  assert.match(payload.body, /g1\.ios\.12tb\.fixture/);
  assert.match(payload.body, new RegExp(TWENTY + "\\.extra"));
  assert.doesNotMatch(payload.body, /g1\.ios\.2tb\.fixture_monthly/);
});

test("20TB stays on the 1-month ultra id; 30TB keeps 90p when that id is present", () => {
  const body = TWENTY + " g1.20tb.3months_ip_75p.acq " + THIRTY + " g1.ai.ultra.3months_ip_90p.acq";
  const { payload } = run("g1-acq.js", { body });
  assert.equal(
    payload.body,
    "g1.ai.ultra.1month_eft.acq g1.20tb.3months_ip_75p.acq g1.ai.ultra.3months_ip_90p.acq g1.ai.ultra.3months_ip_90p.acq"
  );
});

test("collects on other one.google.com paths without rewriting", () => {
  const storage = new Map();
  const { payload } = run("g1-acq.js", {
    url: "https://one.google.com/plans",
    body: "g1.ios.2tb.fixture_monthly",
    storage
  });
  assert.deepEqual(payload, {});
  const scan = JSON.parse(storage.get("g1.sku.scan.v1"));
  assert.equal(scan.skus[0].id, "g1.ios.2tb.fixture_monthly");
  assert.equal(storage.get("g1.pro.annual.test.v1"), undefined);
});

test("decodes a Uint8Array body before matching", () => {
  const bytes = new TextEncoder().encode("sku=g1.ios.2tb.fixture_monthly;");
  const { payload } = run("g1-acq.js", { body: bytes });
  assert.equal(payload.body, "sku=" + TARGET + ";");
});

test("report is local and does not rewrite itself", () => {
  const acq = run("g1-acq.js", {
    url: "https://one.google.com/g1-sku-report?format=json",
    body: "g1.ios.2tb.fixture_monthly"
  });
  assert.deepEqual(acq.payload, {});

  const report = run("g1-sku-report.js", { url: "https://one.google.com/g1-sku-report" });
  assert.equal(report.payload.response.status, 200);
  assert.match(report.payload.response.body, /本机脚本已接管 · v7\.5\.0/);
  assert.match(report.payload.response.body, /Surge/);
  assert.doesNotMatch(report.payload.response.body, /Shadowrocket/);
});

test("surge module does not copy the shadowrocket body and quic traps", () => {
  const module = fs.readFileSync(path.join(root, "g1-acq.sgmodule"), "utf8");
  assert.match(module, /^#!name=G1 ACQ$/m);
  assert.match(module, /requires-body=true/);
  assert.match(module, /max-size=-1/);
  assert.match(module, /binary-body-mode=false/);
  assert.match(module, /script-path=https:\/\/cdn\.jsdelivr\.net\/gh\/xinnyu\/g1-acq-surge@main\/g1-acq\.js/);
  assert.match(module, /script-path=https:\/\/cdn\.jsdelivr\.net\/gh\/xinnyu\/g1-acq-surge@main\/g1-sku-report\.js/);
  assert.match(module, /hostname = %APPEND% one\.google\.com/);
  const scriptLines = module.split("\n").filter((line) => line.includes("type="));
  assert.equal(scriptLines.some((line) => line.includes("DEST-PORT")), false);
  assert.equal(scriptLines.some((line) => /max-size=0(?!\d)/.test(line)), false);
  const response = module.split("\n").find((line) => line.includes("type=http-response"));
  const pattern = new RegExp(response.match(/pattern=([^,]+)/)[1]);
  assert.equal(pattern.test("https://one.google.com/ai?x=1"), true);
  assert.equal(pattern.test("https://one.google.com/plans"), true);
  assert.equal(pattern.test("https://one.google.com.evil/ai?x=1"), false);
  const request = module.split("\n").find((line) => line.includes("type=http-request"));
  const reportPattern = new RegExp(request.match(/pattern=([^,]+)/)[1]);
  for (const url of [
    "https://one.google.com/g1-sku-report",
    "https://one.google.com/g1-sku-report/",
    "https://one.google.com/g1-sku-report?format=json",
    "https://one.google.com/g1-sku-report/?format=json"
  ]) {
    assert.equal(reportPattern.test(url), true, url);
  }
  assert.equal(reportPattern.test("https://one.google.com/g1-sku-report-other"), false);
});
