# VT-M3 交接回执

- task_id: M3
- owner: ebuilder（会话执行者，唯一平台代码写入者）
- contract_version: VT-1
- base_sha: 5d3d809（site-infra main）
- delivered_sha: c99f001（site-infra vps-migration 内容直接提交于本地 main；推送与 VPS 安装在 M5 执行）
- changed_files:
  - config/sites/vast-translator.json（新增：production，probe 31250–31299，acceptance_profile=translation-v1，response_header_timeout 130s，drain 135s）
  - config/sites/vast-translator-preview.json（新增：staging，probe 31200–31249，acceptance_profile=translation-preview-v1，noindex）
  - lib/release/config.mjs（C4 字段严格校验 + cachePurgeRequired/smokePath/smokeMarker/acceptanceProfile 选择器；cache_purge_path 仅在 purge 未显式关闭时必需）
  - lib/release/compose.mjs（healthcheck 用站点 health_path；Caddy response_header_timeout 从配置读取，缺省 300s 保持 FindryAI）
  - lib/release/operations.mjs（prepare 冒烟用 smoke.home_path/marker；promote/rollback：translation-v1 acceptance 门禁 + purge=false 跳过分支（证据记 N/A，不读 purge 秘密）；reconcile 新增 edge-network-attached 漂移检查）
  - lib/release/acceptance.mjs（新增：root 管理验收记录的严格绑定校验；safety_reviewed 布尔不可替代）
  - lib/release/edge-attach.mjs + bin/edge-attach（新增：幂等恢复 edge→site-* 网络附着）
  - lib/scheduler/render.mjs（新增 site-infra-edge-attach.service 单元；翻译器站点无 scheduler.jobs → 不生成 cron）
  - config/backup.json（platform 集合新增 state/、acceptance/、releases/）
  - tests/release/translator.test.mjs（新增：9 用例）
- dependency_shas: APP f862cf3（health 路径 /api/health、/text marker）
- test_results:
  - node --test tests/release/translator.test.mjs: PASS 9/9（VT10 门禁矩阵、VT11 端口范围互斥、VT12 purge/冒烟/环境组合、VT13 幂等附着）
  - node --test tests/release/core.test.mjs: PASS 6/6（FindryAI 回归）
  - node --test tests/backup/*.test.mjs: PASS 17/17（backup 配置回归）
- evidence_paths: 本回执；测试输出见提交前运行日志
- blockers: 无（共享入口真实重载/重建在隔离环境 M5 执行，不在本地或生产验证）
- rollback_notes: 单提交可整体 revert；FindryAI 行为由 core.test 6 用例与显式缺省路径保障

## FindryAI 兼容保证

- config 缺省字段全部走原路径：purge 必需、/Findry/i 冒烟、无 acceptance 门禁、300s header timeout。
- 未修改 findryai.json、调度、秘密；backup 集合仅新增路径。
