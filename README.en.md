# 🌐 Vast Translator

[简体中文](./README.md)

A lightweight, open-source text translation workbench that compares Google, Bing, and optionally Azure Translator results in parallel. One provider can fail without hiding successful results from the others.

## ✨ Features

- Parallel Google and Bing translations
- Optional Azure Translator F0 integration
- Isolated provider failures and a 12-second timeout
- One-click copy and `Ctrl/⌘ + Enter` shortcut
- Responsive desktop and mobile interface
- Server-only credential handling

## 🚀 Run locally

```bash
git clone https://github.com/vastfuture/vast-translator.git
cd vast-translator
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Google and Bing work without keys. To enable Azure, configure the variables documented in `.env.example`.

## 🧪 Checks

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## ⚠️ Important notice

The Google and Bing providers use **undocumented web endpoints**, not supported commercial APIs. They may be rate-limited or changed without notice. For production workloads requiring an SLA, use official paid APIs instead.

Translation text is sent to the selected third-party providers. Do not submit secrets or sensitive personal data.

## ☁️ Deployment

The app requires the dynamic `POST /api/translate` Route Handler, so GitHub Pages alone is not sufficient. The included GitHub Actions workflow deploys to Vercel using `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets.

## 📄 License

[MIT](./LICENSE)
