# VT-M5 交接回执（独立验证 + VPS 候选）

- task_id: M5
- owner: ebuilder
- contract_version: VT-1
- base_sha: APP 91ce3d5 / INFRA 6e8fc57
- delivered_sha: 同上（无新代码；验证与部署执行）
- changed_files: 无（文档级：本回执 + VT-M6）
- dependency_shas: M1–M4 全部
- test_results（全部真实执行，非 mock）:
  - 平台同步至 VPS 后 node --test：translator 9→10 用例 PASS、core 6 PASS、backup 17 PASS
  - preflight（vast-translator-preview/staging）：PASS
  - prepare（91ce3d5-45457504534，探针 31200）：PASS（健康+深度健康+/text marker 冒烟）
  - VT02 loopback 冒烟：6/7 PASS（noindex 项仅适用经 Caddy 链路，已改为公网验证）
  - VT09a 访问保护：匿名 /text 401+noindex、匿名 POST translate 401（收费门禁）、健康豁免 200
  - VT15a 真实短句：google「你好世界。」196ms；bing「你好，世界。」1575ms（经完整公网链路+认证）
  - promote（preview）：PASS，ACTIVE gen=1（证书签发+外网验证通过）
- evidence_paths:
  - /opt/site-infra/evidence/prepare-91ce3d5-45457504534-1795544840722/prepare.json
  - /opt/site-infra/evidence/promote-91ce3d5-45457504534-1795545029533/promote.json
  - CI run 45457504534（VT01）
- blockers: Agnes（key 缺失，DEFERRED，见 VT-M0）
- rollback_notes: preview 站点独立，不影响生产

## 事故记录（重要）

在生产平台运行 core.test.mjs 触发其状态测试覆盖 findryai 生产 state（详见
/opt/site-infra/evidence/incident-20261124-state-overwrite/README.md）。已按
release.json/promote 证据重建 state（generation=9，active=9e156ff），status/公网
健康复验一致；根因已在 INFRA 06bc501 修复（测试隔离 PLATFORM_ROOT）。
