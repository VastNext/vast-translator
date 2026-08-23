# 🌐 Vast Translator

[简体中文](./README.md)

A lightweight, open-source text translation workbench that compares Google, Bing, optional Azure Translator, and Agnes 2.0/2.5 results in parallel. One provider can fail without hiding successful results from the others.

## ✨ Features

- Independent parallel requests with each provider shown as soon as it finishes
- Optional Azure Translator F0 integration
- Independently selectable Agnes 2.0 and Agnes 2.5 models, both unselected by default
- Isolated provider failures with per-provider manual retry and a 12-second standard timeout
- One-click copy and `Ctrl/⌘ + Enter` shortcut
- Independent provider cards for first translation, retranslation, and failure retry without repeating completed providers
- Switchable stacked and side-by-side desktop layouts with a saved preference
- Stacked layout enforced at 900px and below without overwriting the desktop preference
- Server-only credential handling

## 🏗️ Architecture

```text
Browser workbench
    │ One POST /api/translate per selected provider
    ▼
Next.js Route Handler
    │
    ├── Google Web Provider ─── shown when complete
    ├── Bing Web Provider ───── shown when complete
    ├── Azure Provider ──────── shown when complete
    ├── Agnes 2.0 Provider ──── shown when complete
    └── Agnes 2.5 Provider ──── shown when complete
```

The project uses the Next.js App Router, React, TypeScript, Tailwind CSS, and Vitest. Both `/` and `/text/` display the same workbench.

## 🚀 Run locally

```bash
git clone https://github.com/vastfuture/vast-translator.git
cd vast-translator
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Google and Bing work without keys. Azure and both Agnes models are optional. To enable them, copy `.env.example` to `.env.local` and configure the relevant server-side values:

```dotenv
AZURE_TRANSLATOR_KEY=your-key
AZURE_TRANSLATOR_REGION=your-region
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AGNES_API_KEY=your-key
```

Agnes 2.0 and Agnes 2.5 share `AGNES_API_KEY`. Never prefix it with `NEXT_PUBLIC_`. Both models remain unselected by default even when the key is configured and must be explicitly selected in the workbench. Agnes has no application-level timeout, but requests remain subject to client cancellation, upstream network behavior, and the Vercel function execution limit.

## 🧪 Checks

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## ⚠️ Important notice

The Google and Bing providers use **undocumented web endpoints**, not supported commercial APIs. They may be rate-limited or changed without notice. For production workloads requiring an SLA, use official paid APIs instead.

The app does not log translation text or provider credentials. Translation text is sent to every third-party provider you explicitly select, including the selected Agnes models. Do not submit secrets or sensitive personal data. Provider failures are reported independently and can be retried manually from their result card; the app does not retry automatically or fall back to another provider.

On wide desktop screens, use the workbench control to switch between stacked and side-by-side layouts. The preference is saved in the current browser. At 900px and below, the interface temporarily enforces the stacked layout without overwriting that preference; widening the viewport restores the saved layout.

Selecting a provider immediately adds an untranslated card without starting a request. Use the card action to translate it for the first time, retranslate a completed result, or retry a failure. These actions call only that provider and use the text and languages shown when clicked. The bottom “Retranslate all” action explicitly updates every selected provider. Deselecting a provider removes its card and cancels any request still in progress.

Provider selections are saved in the current browser and synchronized when another tab changes them. Restoring a selection only creates untranslated cards and never starts translation automatically; unknown or retired providers are ignored.

## ☁️ Deployment

The app requires the dynamic `POST /api/translate` Route Handler, so GitHub Pages alone is not sufficient. The included GitHub Actions workflow deploys to Vercel using `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets.

To enable Agnes in production, add `AGNES_API_KEY` as a server-side Secret in the Vercel project's Environment Variables. Do not add this provider key to GitHub Actions or expose it through a client-visible environment variable.

## 📄 License

[MIT](./LICENSE)
