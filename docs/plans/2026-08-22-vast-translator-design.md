# Vast Translator 设计文档

## 目标

构建一个以旧版沉浸式翻译文本页为视觉参考的开源文本翻译工作台。产品使用 Vast Translator 品牌，默认并行比较 Google 与 Bing 的翻译结果，并可通过环境变量启用 Azure Translator F0。

## 部署决策

采用 Vercel，而不是 GitHub Pages。页面本身虽然没有数据库或独立常驻服务，但 Google 与 Bing 的非公开网页接口不适合由浏览器直接调用：浏览器会受到 CORS、Cookie、区域跳转和接口暴露等限制。`POST /api/translate` 因此仍需要服务端运行时。GitHub Pages 只能托管静态文件，无法执行 Next.js 的动态 POST Route Handler；Vercel 可以原生运行该 Route Handler。

GitHub Actions 负责测试、构建与生产部署。部署工作流使用 Vercel CLI，需要仓库 Secrets：`VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`。如果 Secrets 尚未配置，CI 仍会正常运行，部署 Job 会给出清晰提示并跳过。

## 架构

- Next.js App Router、TypeScript、Tailwind CSS。
- `/` 与 `/text/` 渲染同一个客户端工作台。
- 浏览器通过 typed fetch 调用 `POST /api/translate`。
- Route Handler 仅负责输入验证、调用翻译编排器并返回统一响应。
- Provider 通过共同接口隔离外部协议：Google Web、Bing Web、Azure。
- Google 与 Bing 默认启用并并行执行；Azure 仅在环境变量完整时进入可用列表。
- 单个 Provider 失败时返回该 Provider 的失败状态，不抛弃其他成功结果。
- 不使用数据库、认证、历史记录、后台任务或全局状态库。

## 界面与交互

视觉基调为安静、轻量的工具型界面：浅灰背景、白色工作区、深色正文和 Vast 蓝绿色强调色。页面顶部显示 Vast Translator 品牌、项目说明和 GitHub 入口。主工作区包含源语言、目标语言、交换按钮、源文本编辑区，以及按 Provider 并列显示的结果区域。

用户输入文本后点击“翻译”，或使用 `Ctrl/Cmd + Enter` 提交。翻译期间各 Provider 独立显示加载状态；完成后可复制结果。失败卡片显示中文可操作错误信息。桌面端结果按列排列，窄屏改为纵向堆叠。语言和 Provider 选择保存到 `localStorage`。

## API 契约

请求：

```json
{
  "text": "Hello world",
  "sourceLanguage": "auto",
  "targetLanguage": "zh-CN",
  "providers": ["google", "bing"]
}
```

响应：

```json
{
  "results": [
    {
      "provider": "google",
      "status": "success",
      "translatedText": "你好，世界",
      "detectedLanguage": "en",
      "durationMs": 120
    }
  ]
}
```

非法输入返回 `400`；请求体过大返回 `413`；所有 Provider 都不可用时仍返回结构化的逐项失败结果。

## Provider 行为

Google Provider 使用旧版开源实现的 `translate.googleapis.com/translate_a/t` 协议，计算 `tk` 并解析 HTML 格式结果。Bing Provider先读取 Translator 页面中的 `IG`、`IID`、`key` 和 `token`，短期缓存后调用 `ttranslatev3`。Azure Provider 使用官方 Text Translation REST API，读取密钥、区域和可选 Endpoint。

每次外部请求设置超时，不自动无限重试。Provider 错误会映射为稳定的内部错误码和中文提示。日志不记录待翻译正文、Token 或密钥。

## 测试

- 单元测试：Google token、Google 响应解析、Bing 凭据解析、语言映射与请求校验。
- 编排测试：并行执行、部分失败、超时和禁用 Provider。
- API 测试：合法请求、非法 JSON、空文本、过长文本和未知 Provider。
- 组件测试：提交、快捷键、加载状态、独立失败和复制结果。
- 构建验证：`npm run lint`、`npm test`、`npm run build`。
- 浏览器 QA：桌面与移动端截图、两个路由、键盘提交和响应式布局。

## 范围边界

MVP 不实现文件翻译、用户账户、服务端历史、术语库、流式输出、自动语言交换、沉浸式翻译私有后端或任何认证绕过。README 明确指出 Google/Bing Web 接口仅适合学习和自托管，可能限流或失效；生产业务优先使用 Azure 等官方 API。
