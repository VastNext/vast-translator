# 渐进式翻译结果与单 Provider 重试实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让各 Provider 结果独立即时呈现，失败项可单独重试，并移除 Agnes 应用层超时。

**Architecture:** 保持现有 JSON Route，不引入流式协议。前端把一次批量操作拆为多个单 Provider HTTP 请求，并用提交快照和批次标识管理渐进结果、取消和重试；服务端编排器允许 Provider 显式关闭应用层超时。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library

---

### Task 1: Agnes 无应用层超时

**Files:**
- Modify: `src/lib/translation/provider.ts`
- Modify: `src/lib/translation/providers/agnes.ts`
- Modify: `src/lib/translation/translate.ts`
- Test: `src/lib/translation/providers/agnes.test.ts`
- Test: `src/lib/translation/translate.test.ts`

1. 写失败测试：Agnes 明确关闭应用超时；编排器不为该 Provider 创建超时结果，但仍响应外部取消。
2. 运行目标测试，确认因当前 `timeoutMs = 30_000` 失败。
3. 最小实现可辨别的“无超时”契约，并只在有数值超时时创建计时器。
4. 运行目标测试及编排器回归测试，确认通过。

### Task 2: 前端渐进式结果

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 写失败测试：开始翻译会为每个 Provider 发送独立请求；快 Provider 先完成时立即显示，慢 Provider 继续加载；卡片顺序保持提交顺序。
2. 增加失败隔离、新批次取消旧请求和旧响应不污染新批次测试。
3. 运行组件测试确认 RED。
4. 用请求快照、每 Provider 状态和批次 AbortController 实现最小逻辑。
5. 运行组件测试确认 GREEN。

### Task 3: 单 Provider 重试

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Modify: `src/components/translator/icons.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 写失败测试：失败卡显示重试按钮；重试只调用该 Provider，使用原提交快照；重试期间仅该卡加载并阻止重复点击。
2. 运行组件测试确认 RED。
3. 增加重试图标、按钮、独立加载状态和最小样式。
4. 运行组件测试确认 GREEN。

### Task 4: 文档、验证与部署

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

1. 更新渐进展示、单项重试和 Agnes 无应用层超时说明。
2. 运行 `npm run lint`、`npm run typecheck`、`npm run test:run`、`npm run build`、`git diff --check`。
3. 进行代码审查，修复高置信度问题并复验。
4. 部署 Vercel production，验证首页和多 Provider 真实请求。
