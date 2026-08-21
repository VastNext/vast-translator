# Vast Translator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建并部署可并行比较 Google、Bing 翻译结果的 Vast Translator 文本翻译工作台。

**Architecture:** Next.js App Router 同时承载响应式前端与 `POST /api/translate`。翻译编排器通过统一 Provider 接口并行调用 Google Web、Bing Web 和可选 Azure，逐项隔离失败。GitHub Actions 执行 CI，并使用 Vercel CLI 部署支持服务端 Route Handler 的生产应用。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS、Vitest、Testing Library、GitHub Actions、Vercel CLI

---

### Task 1: 初始化项目与测试基座

**Files:**
- Create: `package.json`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

1. 使用 create-next-app 初始化 TypeScript、App Router、Tailwind、ESLint 项目。
2. 安装 Vitest、jsdom 与 Testing Library。
3. 添加 `test`、`test:watch`、`typecheck` 脚本。
4. 运行基础测试命令，确认工具链可启动。

### Task 2: 以 TDD 实现领域契约与输入校验

**Files:**
- Test: `src/lib/translation/validation.test.ts`
- Create: `src/lib/translation/types.ts`
- Create: `src/lib/translation/validation.ts`
- Create: `src/lib/translation/languages.ts`

1. 先写空文本、超长文本、非法语言和未知 Provider 的失败测试。
2. 运行测试确认因实现缺失而失败。
3. 实现最小类型和校验逻辑。
4. 运行测试确认通过。

### Task 3: 以 TDD 实现 Google Provider

**Files:**
- Test: `src/lib/translation/providers/google-web.test.ts`
- Create: `src/lib/translation/providers/google-web.ts`
- Create: `src/lib/translation/provider.ts`

1. 先写 token 计算、请求构造、单文本与 HTML 响应解析测试。
2. 确认测试正确失败。
3. 实现最小 Google Web Provider，并注入 `fetch` 以便测试。
4. 确认测试通过。

### Task 4: 以 TDD 实现 Bing Provider

**Files:**
- Test: `src/lib/translation/providers/bing-web.test.ts`
- Create: `src/lib/translation/providers/bing-web.ts`

1. 先写 Translator HTML 凭据解析、语言映射、请求构造和响应解析测试。
2. 确认测试正确失败。
3. 实现凭据缓存与 Bing Web Provider。
4. 确认测试通过。

### Task 5: 以 TDD 实现 Azure 与并行编排

**Files:**
- Test: `src/lib/translation/registry.test.ts`
- Create: `src/lib/translation/providers/azure.ts`
- Create: `src/lib/translation/registry.ts`
- Create: `src/lib/translation/translate.ts`

1. 写并行成功、部分失败、Azure 未配置和超时测试。
2. 确认测试正确失败。
3. 实现 Provider registry、Azure 配置判断与编排器。
4. 确认测试通过。

### Task 6: 以 TDD 实现 Route Handler

**Files:**
- Test: `src/app/api/translate/route.test.ts`
- Create: `src/app/api/translate/route.ts`

1. 写合法请求、非法 JSON、空文本、过长文本测试。
2. 确认测试正确失败。
3. 实现边界校验和统一 JSON 响应。
4. 确认测试通过。

### Task 7: 构建翻译工作台

**Files:**
- Test: `src/components/translator/translator-workbench.test.tsx`
- Create: `src/components/translator/translator-workbench.tsx`
- Create: `src/components/translator/icons.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/text/page.tsx`
- Modify: `src/app/globals.css`

1. 写提交、快捷键、加载、部分失败和复制测试。
2. 确认行为测试正确失败。
3. 实现工作台和两个路由。
4. 完成桌面、平板、移动响应式样式与可见焦点状态。
5. 确认组件测试通过。

### Task 8: 文档与部署

**Files:**
- Create: `README.md`
- Create: `README.en.md`
- Create: `.env.example`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`
- Modify: `.gitignore`

1. 编写中文主 README 和英文版切换链接。
2. 说明架构、启动方法、费用、环境变量与非公开接口风险。
3. 配置 CI 运行 lint、typecheck、test、build。
4. 配置 Vercel CLI 的 GitHub Actions 生产部署。

### Task 9: 完整验证与发布

1. 运行 `npm run lint`。
2. 运行 `npm run typecheck`。
3. 运行 `npm test -- --run`。
4. 运行 `npm run build`。
5. 启动生产构建，使用浏览器检查 `/`、`/text/`、桌面和移动布局。
6. 创建 `vastfuture/vast-translator` 公开仓库并推送。
7. 配置可获得的 Vercel Secrets；若本机未登录 Vercel，则保留可直接使用的工作流并明确剩余一次性配置。
8. 查看 GitHub Actions 结果并修复失败。
