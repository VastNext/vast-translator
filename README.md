# 🌐 Vast Translator

[English](./README.en.md)

一个轻量、开源的多引擎文本翻译工作台。输入一次原文，即可并行比较 Google、Bing，以及可选的 Azure Translator 结果；某个服务失败时，不会影响其他结果。

## ✨ 功能

- ⚡ Google 与 Bing 并行翻译
- 🧩 可选接入 Azure Translator F0
- 🛡️ 单项失败隔离与 12 秒超时保护
- 📋 一键复制结果，支持 `Ctrl/⌘ + Enter` 快捷翻译
- 📱 桌面与移动端响应式界面
- 🔒 凭据只在服务端读取，不会下发浏览器

## 🏗️ 架构

```text
浏览器工作台
    │ POST /api/translate
    ▼
Next.js Route Handler
    │
    ├── Google Web Provider ──┐
    ├── Bing Web Provider ────┼── Promise.all 并行、逐项返回
    └── Azure Provider ───────┘
```

项目使用 Next.js App Router、React、TypeScript、Tailwind CSS 和 Vitest。`/` 与 `/text/` 均显示同一工作台。

## 🚀 本地启动

```bash
git clone https://github.com/vastfuture/vast-translator.git
cd vast-translator
npm install
cp .env.example .env.local
npm run dev
```

访问 <http://localhost:3000>。

Google 与 Bing 默认无需密钥。若要启用 Azure，请在 `.env.local` 填写：

```dotenv
AZURE_TRANSLATOR_KEY=your-key
AZURE_TRANSLATOR_REGION=your-region
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
```

## 🧪 验证

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## 💰 费用

- **Google Web / Bing Web**：本项目使用其网页翻译调用链，不要求 API Key，也不产生本项目可计量的 API 费用。
- **Azure Translator**：可使用 Microsoft 提供的 F0 免费层；配额与价格以 Azure 官方页面为准。
- **Vercel**：个人及低流量项目通常可使用 Hobby 计划，具体限制以 Vercel 当前政策为准。

## ⚠️ 风险与边界

Google 和 Bing Provider 使用的是**非公开网页接口**，不是其受支持的商业 API。它们可能限流、调整参数、改变返回格式或停止工作。请勿把本项目用于高可用或有 SLA 要求的生产场景；此类场景建议改用官方付费 API。

项目不会记录翻译正文或 Azure 凭据。请勿翻译密码、密钥、医疗隐私等敏感信息，因为文本仍会发送到所选第三方翻译服务。

## ☁️ 部署

本项目包含动态 `POST /api/translate`，因此不能仅用 GitHub Pages 静态托管。推荐部署到 Vercel。

仓库包含 GitHub Actions 部署工作流，需要配置以下仓库 Secrets：

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

推送到 `main` 后，工作流会拉取 Vercel 配置、构建并部署生产版本。

## 📄 许可

[MIT](./LICENSE)
