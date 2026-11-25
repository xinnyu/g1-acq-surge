# G1 ACQ（Surge）

[crhywun/g1-acq](https://github.com/crhywun/g1-acq) `v7.5.0` 的 Surge 模块。逻辑没改：先从 `one.google.com` 的原始正文采集 SKU，再只对 `one.google.com/ai?` 做三档字符串替换。

改写命中只说明正文里的商品 ID 被换掉了，不等于 App Store 认这个商品，也不等于能按这个价格扣款。名称、周期、首付和续费以收银台为准。

装这一个模块就行。Surge 会自己拉里面的两个脚本。

## 和上游的差别

- 去掉全局 `UDP/443` 拒绝。Surge 对 MITM hostname 默认 `auto-quic-block`，只挡 `one.google.com` 的 QUIC。上游那条规则会把所有 App 的 HTTP/3 一起掐掉。
- `max-size=-1`。Surge 里 `max-size` 的单位是字节，`0` 会让脚本看不到正文。
- `requires-body=true`，`binary-body-mode=false`。正文按 UTF-8 字符串交给脚本；万一拿到的是 `Uint8Array`，脚本会先解码。
- 没有 `#!system=ios`，Mac 和 iPhone 都能开。订阅页在手机上的 Google App 里，要在手机那台 Surge 上启用。

## 三档映射

| 正文里的完整源 SKU | 默认目标 | 备用 |
|---|---|---|
| `g1.ios.2tb.` 前缀 | `g1.2tb.ai.12months_ip_90p`（没有 `.acq`） | 无 |
| `g1.ios.20tb.m.v2` | `g1.ai.ultra.1month_eft.acq` | 无 |
| `g1.ios.30tb.ai.pro.m` | `g1.ai.pro.12months_eft` | 无 |

20TB 固定写成 `g1.ai.ultra.1month_eft.acq`，30TB 固定写成 `g1.ai.pro.12months_eft`。两档都没有备用。这是字符串判断，不是商店查询。三档都没命中就原样返回。

## 安装

Surge → 模块 → 从 URL 安装：

```text
https://cdn.jsdelivr.net/gh/xinnyu/g1-acq-surge@main/g1-acq.sgmodule
```

装好后打开模块 **G1 ACQ**。模块只往 MITM 里追加 `one.google.com`，证书和 HTTPS 解密总开关还是你自己的。手机要信任 Surge 根证书。MITM 里的 Automatically Block QUIC 保持默认开。

订阅页在手机上的 Google App 里，所以要在手机那台 Surge 上启用。改完模块或解密后重连，再进订阅页。

## 报告

同一台设备的 Safari 打开：

```text
https://one.google.com/g1-sku-report
```

页头应是「本机脚本已接管 · v7.5.0」。JSON：`https://one.google.com/g1-sku-report?format=json`。这是本机脚本回的页面，不是 Google 的。

`?clear=1` 只清 `g1.sku.scan.v1` 和 `g1.pro.annual.test.v1`。字段说明见上游 README。

## 检查

```sh
node --test tests/rewrite.test.cjs
```
