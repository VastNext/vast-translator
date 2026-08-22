# 独立 Provider 卡片实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Provider 选择即时映射为独立卡片，并允许首次翻译、重新翻译和失败重试只调用目标 Provider。

**Architecture:** 将统一批次状态替换为每 Provider 独立卡片状态与请求控制器。批量按钮复用单卡执行入口；所有请求在返回时以 Provider 和 request token 校验有效性，避免移除卡片或新请求后的迟到响应写回。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library

---

### Task 1: Provider 选择即时维护卡片

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 写失败测试：初始 Google/Bing 卡片立即存在且为“尚未翻译”；勾选 Agnes 立即插入固定顺序卡片且不调用 `fetch`。
2. 写失败测试：取消选择移除卡片；重新勾选只创建新卡，不恢复旧结果。
3. 运行组件目标测试，确认失败原因来自当前仅在批量提交后创建 slots。
4. 将卡片状态扩展为 idle/pending/settled，并由 Provider 选择增删卡片。
5. 运行目标测试确认通过。

### Task 2: 单卡执行与动态操作文案

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 写失败测试：idle 显示“翻译”、成功显示“重新翻译”、失败显示“重试”、pending 显示禁用的“正在翻译”。
2. 写失败测试：三种操作都只请求目标 Provider，并使用点击时当前文本和语言。
3. 写失败测试：空输入禁用卡片操作但保留已有结果。
4. 运行目标测试确认 RED。
5. 实现共享 `executeProvider`，每次执行保存独立快照和 request token，只更新目标卡。
6. 更新卡片 UI 与最小样式，保留复制、折叠及无障碍播报。
7. 运行目标测试确认 GREEN。

### Task 3: 独立取消、迟到响应与编辑能力

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 写失败测试：取消 pending Provider 会 abort 该卡请求并立即移除卡片；迟到响应不会恢复卡片。
2. 写失败测试：移除再勾选后，旧请求不能覆盖新卡或解除新请求锁。
3. 写失败测试：单卡 pending 期间仍可编辑文本、语言和 Provider；只有目标卡操作禁用。
4. 写失败测试：组件卸载中止所有独立请求。
5. 运行目标测试确认 RED。
6. 使用 Provider→controller/token 的 ref 映射实现独立取消和竞态防护。
7. 运行目标测试确认 GREEN。

### Task 4: 批量按钮与快照陈旧提示

**Files:**
- Modify: `src/components/translator/translator-workbench.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/translator/translator-workbench.test.tsx`

1. 写失败测试：首次主按钮显示“开始翻译”；存在任意 settled 卡后显示“全部重新翻译”；任一卡 pending 时显示“正在翻译”并禁用。
2. 写失败测试：批量操作调用所有已选 Provider，使用同一份点击时快照，结果仍按固定顺序渐进显示。
3. 写失败测试：当前文本或语言与卡片快照不同时显示“基于较早内容”，恢复一致时提示消失。
4. 写失败测试：单卡 pending 时批量按钮不能启动重叠请求。
5. 运行目标测试确认 RED。
6. 让批量按钮遍历卡片调用共享单卡执行入口，并加入快照比较与状态文案。
7. 运行目标测试确认 GREEN。

### Task 5: 文档、审查、验证与部署

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`

1. 更新独立 Provider 卡片、首次翻译、重新翻译、失败重试和批量重新翻译说明。
2. 运行 `npm run lint`。
3. 运行 `npm run typecheck`。
4. 运行 `npm run test:run`。
5. 运行 `npm run build`。
6. 运行 `git diff --check`。
7. 执行正确性、TypeScript、测试和无障碍审查，修复高置信度问题并复验。
8. 部署 Vercel production，以浏览器和 API 验证新增卡片不产生请求、单卡执行不影响其他卡片。
