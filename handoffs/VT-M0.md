# VT-M0 交接回执

- task_id: M0
- owner: ebuilder（会话执行者，经用户 2026-11-25 指令授权）
- contract_version: VT-1
- base_sha: APP `747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc`；INFRA `5d3d809`（交付时以 M3 提交为准）
- delivered_sha: 见各任务回执
- changed_files:
  - docs/deployment/vps-inputs.json（新增，脱敏决定表）
  - docs/deployment/vps-decisions.md（新增，决定与理由）
  - handoffs/VT-M0.md（本文件）
- dependency_shas: 无
- test_results: 无代码改动，无测试；所有验证类 NOT_RUN
- evidence_paths: docs/deployment/vps-inputs.json
- blockers: 无
- rollback_notes: 纯文档，可整目录回退

## 已核实的现场事实（只读）

1. VPS `192.238.239.41`：FindryAI 双容器 healthy（31106/31107），edge-caddy healthy，内存可用 ~4.7GiB，磁盘可用 66G，site-infra-backup 等 timers 正常。
2. 平台发布身份：`deploy` 用户 + `/usr/local/sbin/site-infra-release` 受限 sudo；审批 HMAC 位于 `/etc/site-infra/approval_hmac`（root 0600）。
3. Vercel `vast-translator` 项目存在，生产 env 仅 `AGNES_API_KEY`；值已通过 `vercel env pull` 取至会话临时目录（git 之外）。
4. 本地无法以 `deploy` 用户 SSH（无对应私钥）；CI 将为 vast-translator 生成独立 deploy 密钥并追加公钥到 VPS authorized_keys。
5. `/text` 页面 marker：`Vast Translator`（layout title，服务端渲染稳定输出）。

## G0 宣告

M0 完成：契约 VT-1 冻结、决定表齐备、无 UNSET 生产参数。M1/M2/M3 可开发。
