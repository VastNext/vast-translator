# Provider 选择记忆实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 记住用户最后一次 Provider 选择，并在重新打开或其他标签页变更时安全恢复仍然有效的选项。

**Architecture:** 在 `TranslatorWorkbench` 中为 Provider 偏好增加独立的 `localStorage` 外部存储，以稳定字符串作为 `useSyncExternalStore` 快照。组件保留会话选择状态，外部快照变化时增量同步卡片，请求执行逻辑保持不变。

**Tech Stack:** React 19、TypeScript、Next.js 16、Vitest、Testing Library、浏览器 `localStorage` 与 `storage` 事件。

---

### Task 1: Provider 偏好解析和默认值

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 增加失败测试，覆盖缺少存储、合法空数组、未知 ID、重复 ID、固定顺序、非法 JSON 和非数组值。
2. 运行 `npm run test:run -- src/components/translator/translator-workbench.test.tsx`，确认新测试失败。
3. 增加 `providerStorageKey`、默认 Provider 常量及安全解析函数。解析结果只包含当前 `providers` 列表中的 ID，并按固定顺序排列。
4. 使用稳定字符串快照接入 `useSyncExternalStore`，避免 snapshot 每次生成新数组。
5. 运行组件测试，确认恢复选择时只呈现 idle 卡片且不调用 `fetch`。

### Task 2: 选择写入和存储失败降级

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 增加失败测试，覆盖勾选、取消、合法全不选和 `setItem()` 抛错。
2. 运行目标测试，确认当前实现不会写入 `vast-translator:providers`。
3. 修改 Provider 切换入口：先按现有逻辑更新当前会话，再尝试写入完整 Provider ID 数组；写入失败不得回滚 UI。
4. 确认 Provider 存储不覆盖 `vast-translator:layout`。
5. 运行组件测试。

### Task 3: 跨标签页增量同步

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 增加失败测试：发送 Provider storage event 后，新增项创建 idle 卡、移除项删除卡并中止自身 pending 请求，保留未变化卡片的结果。
2. 运行目标测试，确认失败。
3. 监听 Provider 存储事件，并将新选择与当前状态增量合并。复用统一清理函数中止请求并清理复制、折叠状态。
4. 保证迟到响应仍受现有 request token 保护，不会恢复被同步移除的卡片。
5. 运行组件测试。

### Task 4: 文档和完整验证

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

1. 更新中英文 README，说明 Provider 选择保存在当前浏览器；未知或已下架选项会被忽略，恢复时不会自动翻译。
2. 运行：
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:run`
   - `npm run build`
   - `git diff --check`
3. 审查实际 diff，重点检查 SSR 水合、跨标签页取消、合法空数组和存储异常。
4. 提交实现并部署生产，验证刷新恢复选择。
