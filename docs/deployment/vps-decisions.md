# vast-translator 迁移决定（VT-1 / M0）

冻结日期：2026-11-25。协调者兼执行者：ebuilder（本会话）。依据用户指令「根据 docs/migration/vast-translator 任务包完成迁移工作，用 docker 方式部署」。

## 基线

| 项 | 值 | 核对方式 |
| --- | --- | --- |
| APP 仓库 | `VastNext/vast-translator` @ `747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc`（main HEAD，工作区干净） | git rev-parse HEAD |
| APP 检出 | `D:/WorkDev/github_repositories/vast-translator` | 本地克隆 |
| INFRA 仓库 | `VastNext/site-infra` @ `5d3d809`（main，干净）→ M3 提交后以交付 SHA 为准 | git log |
| INFRA 检出 | `D:/WorkDev/github_repositories/site-infra` | 本地克隆 |
| 平台部署 | VPS `192.238.239.41` `/opt/site-infra`（无 git，文件同步）；FindryAI ACTIVE generation≈8 | SSH 只读巡检 |
| Node | 22.18.0（VPS 与 CI 对齐；Docker 基础镜像 `node:22.18.0-bookworm-slim`） | VPS node -v |
| 包管理 | APP 原生 npm + package-lock.json，不切 pnpm | package.json |

## 关键决定

1. **candidate_domain = `tr-preview.192-238-239-41.sslip.io`**。与 FindryAI staging 的 `192-238-239-41.sslip.io` 是不同 FQDN（不同 DNS 名称、不同证书、不同 localStorage origin），不违反 C1「不得复用 FindryAI sslip.io 域名」。候选入口以 Caddy basic_auth 凭证保护，匿名请求无法触达翻译 API。
2. **home_marker = `Vast Translator`，home_path = `/text`**。已核对 `src/app/layout.tsx`：站点标题「Vast Translator｜多引擎文本翻译」出现在每页 HTML `<title>`；`/text` 与 `/` 均渲染 TranslatorWorkbench。固定之，M3 不再猜测。
3. **provider 启用集合修订 = google, bing；azure 未启用；agnes 暂 BLOCKED**。Vercel 项目生产环境虽有 `AGNES_API_KEY` 变量，但它是 Sensitive 类型——`vercel env pull` 只返回 `[SENSITIVE VALUE HIDDEN]` 占位，无法取得真实值；平台 secrets（findryai.production.env）亦不含 AGNES_API_KEY（FindryAI 翻译走 GOOGLE_GENERATIVE_AI）。按 C1「不跨项目搜密钥」：不猜测、不借用，Agnes 按契约预期的 BLOCKED 路径延后。用户供给 key 后，向两个 secrets 文件追加一行并更新 `TRANSLATE_ALLOWED_PROVIDERS`，重启容器即恢复（M7 记录为 DEFERRED+负责人=用户）。Azure 缺 key 时卡片显示未配置错误，与现网行为一致。
4. **生产政策 = lab_policy 同值**（body 32768B / max_active 10 / max_starts 60/min / Agnes 120s / request 125s）。Agnes 从无界等待改为 120s 有限上限，属研究文档第三节建议的「可配置上限」路径；Caddy `response_header_timeout=130s`（≥request+5s）、`drain_seconds=135`（≥request+10s）按 C3 派生。
5. **Azure/Agnes 收费硬配额**：Agnes API key 为用户自有 apihub 账号；限流为每进程级别，非全局美元预算。VT15 真实短句验证按最小次数执行（每 provider 一次），并在 M7 记录「每进程限流 ≠ 供应商硬配额」的残留风险，由用户决定是否另立额度控制任务。
6. **旧发布入口冻结方式**：本仓库 `deploy.yml` 现为 Vercel CLI 部署（main push + 手动）。M4 用 VPS 发布 workflow 替换该文件合入 main 后，旧 workflow 即不存在。另在切流后把 Vercel 项目暂停（`vercel project pause`，等价 FindryAI 处理），并在 P3 记录冻结证据。Vercel Git 集成是否存在以 `vercel projects inspect` 输出为准。
7. **回滚目标**：首次生产发布无历史版本时，恢复路径 = 重建已验 digest（P2 已注明），不虚构「上一版本」。生产稳定后以真实 tag 发布第二个版本建立回滚链。
8. **资源**：每版本 768MiB / 1 CPU / 256 pids（候选与生产一致）。VPS 当前可用内存约 4.7GiB、磁盘 66GB，承载 FindryAI 双实例 + 本站双实例绰绰有余；VT14 只做 MEASURED 基线，不做破坏性压测。

## 派发与文件所有权

| 任务 | 负责人 | 白名单外动作 |
| --- | --- | --- |
| M1 镜像与探针 | euilder(本会话) | 无 |
| M2 请求边界 | ebuilder(本会话) | registry.ts 仅为接入 policy 只读引用；types.ts 未改 |
| M3 平台适配 | ebuilder(本会话) | 备份覆盖新增路径：`state/`、`acceptance/`、`releases/`（已登记） |
| M4 流水线 | ebuilder(本会话) | 复用 FindryAI 已验证的 make-release/image-check 模式 |
| M5/M6/M7 | ebuilder(本会话，单人串行) | 生产操作经 installer sudo + deploy 通道 |

单人会话兼多角色；独立接手演练（verification.md 尾节）由 M5 以隔离环境从零部署承担，发现的文档缺口回写本包。

## 未决项

无 UNSET。生产政策初始值与 lab 一致，已由迁移指令覆盖；后续调整需新的用户批准并同步 C4 派生值（130/135s）。
