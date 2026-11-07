# Vercel 部署指南

> 项目：Serverless E-commerce ERP  
> 目标：生产环境运行 Cron、Webhook 公网 URL、集成/压测复测

---

## 1. 前置条件

- GitHub 账号，代码已 push 到远程仓库
- [Vercel](https://vercel.com) 账号（Hobby 可免费部署；**高频 Cron 需 Pro 计划**）
- Supabase、Shopify、Google 凭证与本地 `.env.local` 一致

---

## 2. 导入项目

1. 登录 Vercel → **Add New Project**
2. 选择 GitHub 仓库 `serverless-erp`（或你的仓库名）
3. Framework Preset：**Next.js**（自动检测）
4. Root Directory：`.`（默认）
5. Build Command：`npm run build`（默认）
6. **先不要点 Deploy**，先配置环境变量

---

## 3. 环境变量（Production）

在 Vercel Project → **Settings → Environment Variables**，为 **Production** 添加：

| 变量 | 说明 | 必填 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon Key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role（仅服务端） | ✅ |
| `SHOPIFY_STORE_DOMAIN` | `xxx.myshopify.com` | ✅ |
| `SHOPIFY_ACCESS_TOKEN` | Custom App Token | ✅ |
| `SHOPIFY_API_VERSION` | `2026-07` | ✅ |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook 签名密钥 | ✅ |
| `SHOPIFY_INCLUDE_PII` | Basic 计划填 `false` | ✅ |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 服务账号邮箱 | ✅ |
| `GOOGLE_PRIVATE_KEY` | 私钥（保留 `\n` 换行） | ✅ |
| `GOOGLE_SHEET_ID` | Spreadsheet ID | ✅ |
| `GOOGLE_SHEET_PENDING_ORDERS_TAB` | `Pending_Orders` | ✅ |
| `CRON_SECRET` | 随机长字符串（Cron 鉴权） | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://你的域名.vercel.app` | ✅ |
| `BASE_CURRENCY` | `USD` | 可选 |
| `SHOPIFY_PLATFORM_FEE_RATE` | `0.029` | 可选 |
| `SHOPIFY_PLATFORM_FEE_FIXED` | `0.30` | 可选 |
| `SUPPLIER_COST_RATIO` | `0.55` | 可选 |

**注意：**

- Vercel 海外节点**不需要** `HTTPS_PROXY`；Google OAuth 通常可直接访问
- `GOOGLE_PRIVATE_KEY` 粘贴时选 **Sensitive**，整段含 `-----BEGIN PRIVATE KEY-----`
- 修改 env 后需 **Redeploy** 才生效

---

## 4. 部署

```bash
# 方式 A：Vercel 控制台点 Deploy

# 方式 B：CLI
npm i -g vercel
vercel login
vercel --prod
```

部署成功后记录生产 URL，例如：`https://serverless-erp-xxx.vercel.app`

---

## 5. Cron 任务

`vercel.json` 在 **Hobby** 下每条任务每天最多触发一次，例如：

| 路径 | 频率（UTC） |
|------|-------------|
| `/api/cron/sync-orders` | `0 0 * * *` |
| `/api/cron/sync-supplier` | `0 1 * * *` |

订单主路径为 **Shopify Webhook**；Cron 作日终补偿同步。

**鉴权：** 设置 `CRON_SECRET` 后，Vercel Cron 自动发送：

```
Authorization: Bearer <CRON_SECRET>
```

代码中 `verifyCronSecret()` 已对接。手动测试：

```bash
curl -H "Authorization: Bearer 你的CRON_SECRET" \
  https://你的域名.vercel.app/api/cron/sync-orders
```

> 需要每 5 分钟轮询时：升级 **Pro**，或使用 [cron-job.org](https://cron-job.org) 等外部调度并携带 Bearer 头。

---

## 6. Shopify Webhook 公网 URL

部署后在 Shopify Admin → Settings → Notifications → Webhooks 添加：

| Topic | URL |
|-------|-----|
| Order creation | `https://你的域名.vercel.app/api/webhooks/shopify` |
| Order updated | 同上 |
| Order cancelled | 同上 |

API version 选与 `SHOPIFY_API_VERSION` 一致。Webhook signing secret 写入 `SHOPIFY_WEBHOOK_SECRET`。

---

## 7. 生产环境测试

```bash
# 设置生产 URL
set TEST_BASE_URL=https://你的域名.vercel.app

# 集成测试
npm run test:integration

# 压测（轻量探活，不调用 Shopify）
npm run test:load -- --endpoint /api/health --requests 50 --concurrency 10

# 压测 Shopify 连通
npm run test:load -- --endpoint /api/shopify/test --requests 20 --concurrency 5
```

---

## 8. 常见问题

| 问题 | 处理 |
|------|------|
| Cron 401 Unauthorized | 检查 `CRON_SECRET` 是否配置并 Redeploy |
| Google OAuth 失败 | Vercel 一般无此问题；检查私钥格式 |
| Webhook 401 | `SHOPIFY_WEBHOOK_SECRET` 与 Shopify 后台不一致 |
| 函数超时 | Cron 路由已设 `maxDuration: 60`（Pro 计划支持） |
| 构建失败 | 本地先 `npm run build` 排查类型错误 |

---

*与 `vercel.json`、`.env.example` 同步维护。*
