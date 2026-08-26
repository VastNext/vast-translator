# VastNext Product Family Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Vast Translator 顶部添加 VastNext 归属 backlink，并在页脚提供其他产品入口。

**Architecture:** 在现有 `TranslatorWorkbench` 中添加语义化外部链接，不引入新组件或依赖。复用当前设计变量扩展顶部品牌和响应式页脚布局。

**Tech Stack:** Next.js 16、React 19、CSS、Vitest、Testing Library

---

### Task 1: 添加产品家族链接

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Modify: `src/components/translator/translator-workbench.test.tsx`
- Modify: `src/app/globals.css`

**Step 1: 写失败测试**

测试顶部存在指向 `https://vastnext.com` 的 VastNext backlink，页脚存在 Findry AI、Password Generator 和 GitHub 链接，并验证外部链接使用 `_blank` 与 `noreferrer`。

**Step 2: 验证测试失败**

运行：`npm test -- --run src/components/translator/translator-workbench.test.tsx -t "产品家族导航"`

预期：因链接尚不存在而失败。

**Step 3: 实现最小标记和样式**

- 顶部品牌旁添加 `by VastNext`。
- 页脚改为品牌说明与产品链接导航。
- 添加桌面与移动端响应式样式和 focus/hover 状态。

**Step 4: 完整验证**

运行：`npm run test:run && npm run typecheck && npm run lint && npm run build`

预期：所有命令成功。

**Step 5: 视觉验证**

在桌面和移动端截图，确认顶部品牌层级清晰、页脚无溢出且链接可见。

**Step 6: 提交并推送**

```bash
git add docs/plans/2026-08-26-product-family-navigation.md src/components/translator/translator-workbench.tsx src/components/translator/translator-workbench.test.tsx src/app/globals.css
git commit -m "feat: add VastNext product navigation"
git push origin main
```
