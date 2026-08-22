---
title: feat: 接入 Agnes 双模型并增加工作台布局切换
type: feat
status: active
date: 2026-08-22
origin: docs/brainstorms/2026-08-22-agnes-layout-requirements.md
---

# feat: 接入 Agnes 双模型并增加工作台布局切换

## 概述

在现有统一 Provider 架构中增加 Agnes 2.0 与 Agnes 2.5 两个独立翻译服务，并在桌面端增加上下、左右两种工作台布局。默认选择仍为 Google 与 Bing；两个 Agnes 默认不选。左右布局把完整输入与操作区放在左侧，把结果区放在右侧并纵向排列结果卡；900px 及以下临时强制上下布局。

## 问题与范围

现有应用无法比较两代 Agnes 模型，所有 Provider 也共用 12 秒超时，不适合实测存在明显尾延迟的 Agnes。现有 UI 只有上下结构，不适合桌面长文本对照阅读。本计划扩展既有模式，不引入 SDK、流式响应、持久化后端、重试、模型回退或新的语言。

## 需求追踪

- R1–R5b：两个 Agnes 独立可选、共享服务端密钥、支持现有语言、严格校验输出并隔离失败。
- R6–R12：桌面端可切换布局；上下布局不回归；左右布局的右栏结果纵向排列；窄屏不覆盖持久偏好。
- 成功标准：两个 Agnes 完成现有语言双向验证；默认 Provider 不变；Agnes 使用 30 秒独立超时并保持批量响应。

## 关键技术决策

- Provider ID 使用 `agnes-2-0`、`agnes-2-5`，避免带点号 ID 与 CSS 类冲突；上游模型名仍为 `agnes-2.0-flash`、`agnes-2.5-flash`。
- 用一个参数化 Agnes Provider 创建两个实例，复用协议、提示词、语言映射和错误处理，不复制实现。
- 继续直接使用注入式 `fetch`，不引入 OpenAI SDK。
- Provider 可声明 `timeoutMs`；默认仍为 12 秒，Agnes 为 30 秒。编排器同时中止网络请求并以超时 Promise 保证硬性结束。
- Route Handler 保持一次性 JSON 响应，并声明 40 秒函数时限，为 30 秒应用超时留出收尾空间。
- 提示词使用固定系统指令与 JSON 序列化数据对象隔离原文；仅接受正常停止、非空字符串内容。
- 布局状态区分 `preferredLayout` 和 `effectiveLayout`；宽屏断点统一为 900px，窄屏不写回偏好。
- 左右布局的左栏包含完整输入卡（语言、原文、Provider 和提交），右栏包含标题、状态与所有结果。
- Azure 保留，因此最大可选 Provider 数为五个；四 Provider 是重点比较组合而非系统上限。

## 实现单元

- [ ] **单元 1：扩展 Provider 契约与 Agnes 协议实现**

  **目标：** 增加两个公开 Provider ID、逐 Provider 超时声明，以及共享的 Agnes Chat Completions 实现。

  **需求：** R1–R5b。

  **文件：**
  - 修改：`src/lib/translation/types.ts`
  - 修改：`src/lib/translation/provider.ts`
  - 新建：`src/lib/translation/providers/agnes.ts`
  - 新建测试：`src/lib/translation/providers/agnes.test.ts`
  - 修改测试：`src/lib/translation/validation.test.ts`

  **方法：** Agnes Provider 接收固定 ID、标签和模型名；从 `AGNES_API_KEY` 读取凭据，调用官方 `/v1/chat/completions`；映射现有语言代码为无歧义英文名称；使用低随机性、非流式请求和足够覆盖 5000 字输入的输出预算。错误只返回受控中文信息，不透传密钥、原文或原始错误体。

  **执行说明：** 测试优先。

  **测试场景：** 两模型 model 字段正确；自动检测和简繁体映射正确；原文含换行、引号、标签和伪指令时仍处于数据字段；正常响应 trim 后返回；空内容、异常结构和 `finish_reason: length` 失败；401/403、429、5xx 和网络错误不重试且不泄密；Signal 透传；无密钥时不可用。

- [ ] **单元 2：注册双模型并实现严格逐 Provider 超时**

  **目标：** 两个 Agnes 出现在统一 Registry 中并以 30 秒硬上限并发运行，其他 Provider 保持 12 秒。

  **需求：** R1、R4、R5、R5b。

  **依赖：** 单元 1。

  **文件：**
  - 修改：`src/lib/translation/registry.ts`
  - 新建测试：`src/lib/translation/registry.test.ts`
  - 修改：`src/lib/translation/translate.ts`
  - 修改测试：`src/lib/translation/translate.test.ts`

  **方法：** Registry 用同一实现创建两个实例。编排器对每项建立独立控制器和超时竞争，保持请求顺序、`Promise.all` 批量语义与现有错误码；计时器总能清理，超时后吸收迟到 Promise，避免未处理拒绝。

  **执行说明：** 测试优先。

  **测试场景：** Registry 包含五个 Provider；两个 Agnes 共用凭据且模型不同；无密钥时均不可用；两个 Agnes 并发启动；一个成功、一个失败不互相影响；默认 12 秒、Agnes 30 秒；Provider 忽略 Signal 且永不结束时仍返回 `TIMEOUT`；未配置快速失败；返回顺序稳定。

- [ ] **单元 3：扩展 API 契约与部署时限**

  **目标：** API 接受两个 Agnes ID，并允许应用在平台强制终止前生成结构化超时结果。

  **需求：** R1、R5。

  **依赖：** 单元 2。

  **文件：**
  - 修改：`src/app/api/translate/route.ts`
  - 修改测试：`src/app/api/translate/route.test.ts`

  **方法：** 保持 Node runtime 和单次 JSON 响应；导出 `maxDuration = 40`。Route 不读取密钥、不增加 Agnes 专用端点。

  **测试场景：** 两个 Agnes ID 原样进入翻译层；未知模型名/Provider 仍返回 400；现有空文本和 413 行为不变；模块时限大于 Agnes 超时。

- [ ] **单元 4：增加 Agnes 选择、结果和请求快照**

  **目标：** UI 显示五个 Provider，两个 Agnes 可独立选择且默认不选，并防止重复提交或加载中选择变化造成请求与骨架错位。

  **需求：** R1、R2、R5。

  **依赖：** 单元 1 的 Provider ID。

  **文件：**
  - 修改：`src/components/translator/translator-workbench.tsx`
  - 修改测试：`src/components/translator/translator-workbench.test.tsx`
  - 修改：`src/app/globals.css`

  **方法：** 扩展 Provider 元数据与标签；提交时保存 Provider 快照用于请求和加载骨架，并用同步 ref 阻止同一渲染周期内重复提交；加载中禁用语言与 Provider 控件，原文可编辑但只影响下一次请求。

  **执行说明：** 测试优先。

  **测试场景：** 默认只选 Google/Bing；两个 Agnes 独立与同时选择；请求体包含稳定 ID；分别显示结果和错误；加载骨架与提交快照一致；快速双击、连续快捷键及组合触发只发送一次请求；完成或失败后可再次提交。

- [ ] **单元 5：实现上下/左右布局偏好与响应式样式**

  **目标：** 宽屏可在现有上下布局与沉浸式左右对照布局间切换，窄屏临时使用上下布局。

  **需求：** R6–R12。

  **依赖：** 单元 4。

  **文件：**
  - 修改：`src/components/translator/translator-workbench.tsx`
  - 修改测试：`src/components/translator/translator-workbench.test.tsx`
  - 修改：`src/app/globals.css`

  **方法：** 在输入卡和结果区外增加布局容器；分段按钮组放在工作台右上方，使用 `aria-pressed`。初始渲染为上下，挂载后安全读取 `vast-translator:layout`；通过 `matchMedia('(max-width: 900px)')` 派生有效布局并监听变化。左右模式使用等宽双栏，右侧结果网格强制单列；窄屏隐藏控件。

  **执行说明：** 测试优先，并在完成后做一次桌面与移动视觉验证。

  **测试场景：** 缺失、合法、非法及读写异常 storage；点击后持久化；窄屏保存左右偏好但实际上下且不改写；恢复宽屏自动恢复左右；listener 清理；布局变化不清空输入、结果或触发 API；键盘和选中语义可访问。

- [ ] **单元 6：文档、环境与生产验证**

  **目标：** 完成安全配置说明、双语文档和真实部署验证。

  **依赖：** 单元 1–5。

  **文件：**
  - 修改：`.env.example`
  - 修改：`README.md`
  - 修改：`README.en.md`
  - 修改：`src/app/layout.tsx`

  **方法：** 只增加空的 `AGNES_API_KEY` 示例；说明原文会发送给所选第三方、Agnes 默认不选、30 秒超时、不重试/不回退、布局偏好与窄屏行为。Vercel Secret 在项目环境配置，不进入 GitHub Actions 或客户端变量。

  **验证场景：** lint、类型检查、全量测试和生产构建通过；受控真实 API 验证两个模型的现有语言双向翻译；无密钥时独立失败；生产 `/` 与 `/text/`、桌面两种布局和移动端均通过；浏览器请求与客户端产物不包含密钥。

## 系统影响

- **API 契约：** `ProviderId` 新增两个稳定值；旧请求与响应保持兼容。
- **错误传播：** Agnes 协议错误先被转换为受控 Error，再由编排器统一映射为逐项 `UPSTREAM_ERROR`；超时统一为 `TIMEOUT`。
- **时延：** 选择 Agnes 后批量响应尾延迟最多约 30 秒；未选择时现有路径和 12 秒上限不变。
- **状态生命周期：** 布局切换只改变 CSS 排列；翻译业务状态不重新挂载。请求快照避免在途选择变化污染加载 UI。
- **隐私：** API Key 只存在服务端；原文会发送给用户所选 Provider，但不写日志。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Agnes 延迟或 429 阻塞批量响应 | 默认不选、30 秒硬上限、不重试、不回退、逐项错误隔离 |
| Vercel 时限低于应用时限 | Route 声明 40 秒并在部署前核对项目计划支持情况 |
| LLM 返回解释、拒答或截断 | 固定翻译指令、数据边界、低随机性、结构和 finish reason 校验 |
| 五个 Provider 在窄屏拥挤 | 900px 以下上下布局；760px 以下复核 chip 网格，必要时采用两列 |
| localStorage 或 matchMedia 不可用 | 安全回退上下布局，持久化失败不阻断当前会话 |
| 用户已在对话公开过密钥 | 不提交、不回显；上线后建议轮换并只保存在 Vercel Secret |

## 不在范围内

- Agnes 1.5/Pro、自由模型选择、流式结果、分块翻译、自动重试或模型回退。
- Provider/语言偏好持久化、多标签页实时同步、独立布局设置页。
- 新的限流持久化系统、账户、历史或数据库。

## 参考

- 需求：`docs/brainstorms/2026-08-22-agnes-layout-requirements.md`
- 现有设计：`docs/plans/2026-08-22-vast-translator-design.md`
- Provider 模式：`src/lib/translation/providers/azure.ts`
- 编排模式：`src/lib/translation/translate.ts`
- 工作台：`src/components/translator/translator-workbench.tsx`
- Agnes 官方文档：https://agnes-ai.com/zh-Hans/docs/agnes-25-flash
