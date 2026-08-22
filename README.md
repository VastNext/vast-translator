# 🌐 Vast Translator

[English](./README.en.md)

一个轻量、开源的多引擎文本翻译工作台。输入一次原文，即可并行比较 Google、Bing、可选的 Azure Translator，以及 Agnes 2.0/2.5 结果；某个服务失败时，不会影响其他结果。

## ✨ 功能

- ⚡ 所选 Provider 独立并行请求，完成一个便立即显示一个
- 🧩 可选接入 Azure Translator F0
- 🤖 可独立选择 Agnes 2.0 与 Agnes 2.5，两个模型默认均不选
- 🛡️ 单项失败隔离与手动重试；常规 Provider 使用 12 秒超时保护
- 📋 一键复制结果，支持 `Ctrl/⌘ + Enter` 快捷翻译
- ↔️ 桌面端支持上下或左右工作台布局，并记住布局偏好
- 📱 900px 及以下自动使用上下布局，恢复宽屏后继续采用已保存偏好
- 🔒 凭据只在服务端读取，不会下发浏览器

## 🏗️ 架构

```text
浏览器工作台
    │ 每个所选 Provider 独立 POST /api/translate
    ▼
Next.js Route Handler
    │
    ├── Google Web Provider ─── 完成即显示
    ├── Bing Web Provider ───── 完成即显示
    ├── Azure Provider ──────── 完成即显示
    ├── Agnes 2.0 Provider ──── 完成即显示
    └── Agnes 2.5 Provider ──── 完成即显示
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

Google 与 Bing 默认无需密钥。Azure 和两个 Agnes 模型均为可选服务；Agnes 2.0 与 Agnes 2.5 共用一个服务端密钥。按需在 `.env.local` 填写：

```dotenv
AZURE_TRANSLATOR_KEY=your-key
AZURE_TRANSLATOR_REGION=your-region
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AGNES_API_KEY=your-key
```

`AGNES_API_KEY` 只能保存在服务端环境中，不要添加 `NEXT_PUBLIC_` 前缀。即使配置了密钥，Agnes 2.0 与 Agnes 2.5 也不会被默认选中，需在工作台中明确选择。Agnes 不设置应用层超时，但仍受客户端取消、上游网络和 Vercel 函数执行时限约束。

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
- **Agnes 2.0 / 2.5**：使用 Agnes API，两个模型共用 `AGNES_API_KEY`；配额与价格以 Agnes 官方页面为准。
- **Vercel**：个人及低流量项目通常可使用 Hobby 计划，具体限制以 Vercel 当前政策为准。

## ⚠️ 风险与边界

Google 和 Bing Provider 使用的是**非公开网页接口**，不是其受支持的商业 API。它们可能限流、调整参数、改变返回格式或停止工作。请勿把本项目用于高可用或有 SLA 要求的生产场景；此类场景建议改用官方付费 API。

项目不会记录翻译正文或 Provider 凭据。原文会发送到你明确选择的第三方翻译服务，包括所选的 Agnes 模型；请勿翻译密码、密钥、医疗隐私等敏感信息。Provider 失败会独立显示，可使用该结果卡上的按钮手动重试；系统不会自动重试或回退到其他 Provider。

桌面宽屏可在“上下”和“左右”布局间切换，选择会保存在当前浏览器。视口宽度为 900px 及以下时，界面临时强制使用上下布局且不覆盖已保存偏好；恢复宽屏后会自动恢复原偏好。

## ☁️ 部署

本项目包含动态 `POST /api/translate`，因此不能仅用 GitHub Pages 静态托管。推荐部署到 Vercel。

仓库包含 GitHub Actions 部署工作流，需要配置以下仓库 Secrets：

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

推送到 `main` 后，工作流会拉取 Vercel 配置、构建并部署生产版本。

如需启用 Agnes，请在 Vercel 项目的 Environment Variables 中添加服务端 Secret `AGNES_API_KEY`。不要将该密钥配置为 GitHub Actions Secret，也不要使用客户端可见的环境变量。

## 📄 许可

[MIT](./LICENSE)
