# Serverless E-commerce ERP

基于 **Next.js 15** 与 **Serverless** 架构的轻量化跨境电商 ERP 系统。面向 Shopify 独立站卖家，实现从订单自动抓取、供应商履约、物流回传、虚拟库存联动到多币种财务对账的**零人工干预**自动化闭环。

> 毕业设计课题：Serverless 架构与 Next.js 全栈框架在跨境电商履约场景下的整合应用。

---

## 功能概览

| 模块 | 能力 | 状态 |
|------|------|------|
| **订单同步** | Shopify GraphQL 轮询 + Webhook 接收，幂等入库 | ✅ 已完成 |
| **供应商履约** | Google Sheet 扫描 → 物流回传 Shopify → 库存扣减 | ✅ 已完成 |
| **虚拟库存** | 下单预留、发货扣减、低库存预警 | ✅ 已完成 |
| **财务对账** | 多币种换算、按单利润核算（2 位小数） | ✅ 已完成 |
| **Dashboard** | 履约分布、按单利润图、低库存列表 | ✅ 已完成 |
| **用户鉴权** | Supabase Auth + RLS 客户端 | ⏳ 待完成 |
| **生产部署** | Vercel Cron + 环境变量配置 | ⏳ 待完成 |
| **自动化测试** | 单元 / 集成 / 回归测试矩阵 | ⏳ 待完成 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + TypeScript |
| UI | Shadcn/ui + Tremor + Tailwind CSS 4 |
| 数据库 | Supabase (PostgreSQL) + RLS |
| 电商 | Shopify Custom App (Admin GraphQL API) |
| 供应商 | Google Sheets API（模拟 WMS 中间层） |
| 部署 | Vercel Serverless Functions + Cron |

---

## 系统架构

```
┌─────────────┐     GraphQL / Webhook      ┌──────────────────┐
│   Shopify   │ ◄────────────────────────► │   Next.js API    │
│  Custom App │                              │  (Serverless)    │
└─────────────┘                              └────────┬─────────┘
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────┐
                    │                                 │                         │
                    ▼                                 ▼                         ▼
            ┌──────────────┐                 ┌──────────────┐          ┌──────────────┐
            │   Supabase   │                 │ Google Sheet │          │  Dashboard   │
            │  PostgreSQL  │                 │ Pending_Orders│          │  (SSR Pages) │
            │  3NF Schema  │                 │  (Supplier)  │          └──────────────┘
            └──────────────┘                 └──────────────┘
```

### 核心业务闭环

```
Shopify 新订单
  → sync-orders（GraphQL 轮询 / Webhook）
  → Supabase 入库 + 库存预留
  → Google Sheet 写入 Pending_Orders

供应商填写 tracking（Sheet 状态 = Processing）
  → sync-supplier（Cron 扫描）
  → Shopify fulfillmentCreateV2 回传物流
  → Supabase 写入 fulfillments + 库存扣减
  → 财务记账 financial_logs
  → Sheet 状态更新为 Shipped
```

---

## 项目结构

```
├── app/
│   ├── (dashboard)/          # ERP 管理后台
│   │   ├── page.tsx          # 总览 Dashboard
│   │   ├── orders/           # 订单列表（含 tracking）
│   │   ├── inventory/        # 库存管理（含 unit cost）
│   │   └── finance/          # 财务对账
│   ├── (auth)/login/         # 登录页（占位，待接入 Auth）
│   └── api/
│       ├── cron/             # 定时任务入口
│       ├── shopify/test/     # Shopify 连通性测试
│       ├── google/test/      # Google Sheets 诊断
│       └── webhooks/shopify/ # Webhook 接收器
├── components/
│   ├── dashboard/            # 图表、指标卡片、侧边栏
│   ├── orders/               # 订单表格
│   └── inventory/            # 库存表格
├── lib/
│   ├── shopify/              # GraphQL 客户端、订单入库、履约回传
│   ├── supplier/             # Google Sheets 读写、履约同步
│   ├── finance/              # 利润计算、汇率、财务记录
│   ├── supabase/             # 数据库客户端、库存函数
│   └── data/                 # Dashboard / Orders / Finance 数据层
├── supabase/
│   ├── migrations/           # 数据库迁移（3NF + RLS + 库存函数）
│   └── seed.sql              # 演示 SKU 种子数据
├── types/                    # 全局 TypeScript 类型定义
├── vercel.json               # Cron 调度配置
└── .env.example              # 环境变量模板
```

---

## 数据库设计（3NF）

| 表 | 说明 |
|----|------|
| `orders` | Shopify 订单主表，含履约状态枚举 |
| `order_items` | 订单行项目（SKU、数量、单价） |
| `inventory` | 虚拟库存池（local / supplier / reserved） |
| `fulfillments` | 物流追踪号，标记是否已同步 Shopify |
| `financial_logs` | 按单利润明细（gross / cost / fee / net） |
| `webhook_events` | Webhook 幂等去重账本 |
| `v_inventory_alerts` | 低库存预警视图 |

**履约状态机：** `pending` → `processing` → `shipped` → `delivered`（或 `cancelled` / `failed`）

**库存函数（PostgreSQL）：**
- `reserve_inventory(sku, qty)` — 下单预留
- `fulfill_inventory_deduction(sku, qty)` — 发货扣减
- `release_inventory_reservation(sku, qty)` — 取消释放

---

## 快速开始

### 1. 环境要求

- Node.js 18+
- Supabase 项目（已执行 migrations）
- Shopify 开发店铺 + Custom App
- Google Cloud 服务账号 + 目标 Spreadsheet

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase / Shopify / Google 凭证
```

### 4. 初始化数据库

在 Supabase SQL Editor 中依次执行：

```
supabase/migrations/20250815100000_initial_schema.sql
supabase/migrations/20250815100001_rls_policies.sql
supabase/migrations/20250815100002_inventory_functions.sql
supabase/migrations/20250815100003_inventory_supplier_cost.sql
supabase/seed.sql
```

或在项目根目录执行（自动读取 `.env.local`）：

```bash
npm run seed:inventory
```

将写入 7 条演示 SKU，含 2 条低库存告警（SKU-003、SKU-004），供 Inventory 页与 Dashboard 截图使用。

### 5. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 6. 验证连通性

```bash
# Shopify API
curl http://localhost:3000/api/shopify/test

# Google Sheets（国内需配置 HTTPS_PROXY）
curl http://localhost:3000/api/google/test

# 手动触发订单同步
curl http://localhost:3000/api/cron/sync-orders

# 手动触发供应商履约同步
curl http://localhost:3000/api/cron/sync-supplier
```

---

## 环境变量

完整列表见 [`.env.example`](.env.example)，核心变量如下：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥（绕过 RLS） |
| `SHOPIFY_STORE_DOMAIN` | 店铺域名 |
| `SHOPIFY_ACCESS_TOKEN` | Custom App Admin API Token |
| `SHOPIFY_API_VERSION` | GraphQL API 版本（如 `2026-07`） |
| `SHOPIFY_INCLUDE_PII` | Basic 计划须设为 `false` |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook HMAC 签名密钥 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google 服务账号邮箱 |
| `GOOGLE_PRIVATE_KEY` | 服务账号私钥 |
| `GOOGLE_SHEET_ID` | 目标 Spreadsheet ID |
| `CRON_SECRET` | Vercel Cron 鉴权密钥 |
| `BASE_CURRENCY` | 利润归一化基准货币（默认 USD） |
| `SHOPIFY_PLATFORM_FEE_RATE` | 平台费率（默认 2.9%） |
| `SHOPIFY_PLATFORM_FEE_FIXED` | 平台固定费（默认 $0.30） |
| `SUPPLIER_COST_RATIO` | 无 unit_cost 时的成本估算比例 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 国内访问 Google API 代理 |

---

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/cron/sync-orders` | GET | 拉取 Shopify 订单 → Supabase + Sheet |
| `/api/cron/sync-supplier` | GET | 扫描 Sheet tracking → Shopify 履约 |
| `/api/cron/backfill-sheets` | GET | 补写历史订单到 Google Sheet |
| `/api/cron/backfill-finance` | GET | 补算已发货订单财务记录 |
| `/api/webhooks/shopify` | POST | Webhook 接收（HMAC 校验 + 幂等） |
| `/api/shopify/test` | GET | Shopify API 连通性诊断 |
| `/api/google/test` | GET | Google Sheets 分阶段诊断 |

> 生产环境 Cron 请求需携带 `Authorization: Bearer <CRON_SECRET>`；本地开发可跳过。

---

## Dashboard 页面

| 路径 | 内容 |
|------|------|
| `/` | 净利润 / 营收 / 待履约 / 低库存 KPI；履约分布饼图；按单利润柱状图；低库存 SKU 列表 |
| `/orders` | 订单号、Shopify ID、履约状态、Tracking、Carrier、同步状态、金额 |
| `/inventory` | SKU 库存、可用量、单位成本、库存价值汇总 |
| `/finance` | 按单 gross / cost / fee / net profit，含汇率与币种 |
| `/login` | 登录页（占位，Step 7 接入 Supabase Auth） |

---

## Google Sheet 结构

Sheet 名称：`Pending_Orders`

| 列 | 字段 | 说明 |
|----|------|------|
| A | order_number | 订单号（如 #1001） |
| B | shopify_order_id | Shopify 订单 ID |
| C | sku | 商品 SKU |
| D | quantity | 数量 |
| E | customer_name | 客户姓名 |
| F | shipping_address | 收货地址 |
| G | status | Processing / Shipped / Cancelled |
| H | tracking_number | 物流单号（供应商填写） |
| I | carrier | 承运商 |
| J | created_at | 创建时间 |

---

## 论文导出

```bash
npm run export:thesis   # doc/论文初稿.md → doc/论文初稿.docx
```

导出后请粘贴至学校 Word 模版，补充封面、声明书、目录与插图。

## Vercel 部署

详细步骤见 [`doc/Vercel部署指南.md`](doc/Vercel部署指南.md)。

`vercel.json` 已配置 Cron 调度：

| 任务 | 频率 |
|------|------|
| `/api/cron/sync-orders` | 每 5 分钟 |
| `/api/cron/sync-supplier` | 每 5 分钟 |

部署步骤：

1. 推送代码至 GitHub
2. 在 Vercel 导入项目
3. 配置全部环境变量（参考 `.env.example`）
4. 设置 `CRON_SECRET` 并确保 Cron 请求鉴权生效

---

## 开发进度

| Step | 内容 | 状态 |
|------|------|------|
| 1 | 项目脚手架、UI 框架、Dashboard 骨架 | ✅ |
| 2 | 数据库 3NF Schema、RLS、库存函数 | ✅ |
| 3 | Shopify 订单同步（轮询 + Webhook + 幂等） | ✅ |
| 4 | 供应商履约同步（Sheet → Shopify fulfill） | ✅ |
| 5 | 财务模块（多币种利润 + backfill） | ✅ |
| 6 | Dashboard 数据完善（tracking、cost、利润图） | ✅ |
| 7 | Supabase Auth 登录 + RLS 客户端 | ⏳ |
| 8 | Vercel 生产部署 + Cron 验证 | ⏳ |
| 9 | 测试矩阵、文档、论文材料 | ⏳ |

---

## 已知限制

1. **供应商对接**：当前以 Google Sheet 模拟美国 WMS，非直接 API 对接
2. **库存双向同步**：已实现下单预留 + 发货扣减，缺少发货商端库存定时回写
3. **Shopify Basic 计划**：无法获取客户 PII（email / 地址），已通过 `SHOPIFY_INCLUDE_PII=false` 降级
4. **国内网络**：访问 Google API 需配置 `HTTPS_PROXY` 或 TUN 模式
5. **鉴权**：Dashboard 当前使用 service_role 直连，未启用 RLS 用户隔离
6. **自动化测试**：尚无单元 / 集成测试，技术指标未正式量化

---

## 常用命令

```bash
npm run dev        # 启动开发服务器
npm run build      # 生产构建
npm run start      # 启动生产服务器
npm run lint       # ESLint 检查
npm run typecheck  # TypeScript 类型检查
```

---

## 参考资料

- [Shopify Custom Apps](https://help.shopify.com/en/manual/apps/app-types/custom-apps)
- [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql/latest)
- [Next.js App Router](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

---

## License

Private — 毕业设计项目，仅供学术研究使用。
