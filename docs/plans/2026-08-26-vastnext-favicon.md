# VastNext Favicon Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 使用 VastNext 官方品牌图标替换 Vast Translator 的 Next.js 模板 favicon。

**Architecture:** 使用 Next.js App Router 的文件约定，将官方 SVG 保存为 `src/app/icon.svg`，并删除冲突的模板 `src/app/favicon.ico`。图标完全本地托管，不增加运行时依赖。

**Tech Stack:** Next.js 16 App Router、SVG、Vitest

---

### Task 1: 替换应用图标

**Files:**
- Create: `src/app/icon.svg`
- Delete: `src/app/favicon.ico`

**Step 1: 添加 VastNext 官方 SVG**

将 `https://vastnext.com/favicon.svg` 的内容原样保存为 `src/app/icon.svg`。

**Step 2: 删除模板 favicon**

删除 `src/app/favicon.ico`，避免 Next.js 同时生成两个图标链接。

**Step 3: 验证**

运行：`npm run test:run && npm run typecheck && npm run lint && npm run build`

预期：全部命令成功，构建输出包含 `/icon.svg` 元数据。

**Step 4: 提交并推送**

```bash
git add src/app/icon.svg src/app/favicon.ico docs/plans/2026-08-26-vastnext-favicon.md
git commit -m "fix: use VastNext brand favicon"
git push origin main
```
