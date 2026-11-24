# VT-M4 交接回执

- task_id: M4
- owner: ebuilder
- contract_version: VT-1
- base_sha: APP f862cf3
- delivered_sha: APP 91ce3d5（merge vps-migration → main，含 b821aab M4 提交与 9d16847 文档修订）
- changed_files:
  - .github/workflows/build-image.yml（只构建入口：一次解析 SHA、四项检查重放、GHA 缓存、VT01 镜像审计）
  - .github/workflows/deploy.yml（替换 Vercel 发布=P3 冻结；两阶段：tag/dispatch 触发 prepare，promote 为独立手动入口、服务端 acceptance 门禁强制）
  - scripts/deploy/make-release.mjs（默认 site=vast-translator；git_sha 字段对齐 C5）
  - scripts/deploy/image-check.mjs（VT01：非 root/无 env/无 docker socket/秘密标记扫描）
  - tests/deploy/release-contract.test.ts（3 用例：prepare 形状、rollback 目标绑定、非法输入非零退出）
- test_results: lint/typecheck/test:run(210)/build PASS；CI run 45457504534 全绿（含 VT01 审计）
- evidence_paths: github:VastNext/vast-translator/actions/runs/45457504534
- blockers: 无
- rollback_notes: revert 91ce3d5 即恢复旧 Vercel workflow（不建议，除非放弃 VPS）

## 部署配套（M4–M5 实际操作）

- CI deploy 密钥：`vt_deploy_ed25519`（本地 G:/Caches/Temp/opencode/vt-keys/，公钥已装 VPS deploy 用户 authorized_keys）
- 仓库 Secrets **尚未设置**（需用户或后续会话执行）：`APPROVAL_HMAC`、`VPS_SSH_KEY`、`VPS_HOST=192.238.239.41`、`VPS_USER=deploy`、`VPS_KNOWN_HOSTS`（同目录有现成文件）
- make-release 需注意：`image_repo` 按站点名生成，preview 站点须手工补丁为 `ghcr.io/vastnext/vast-translator`（两站点共用镜像仓库）
