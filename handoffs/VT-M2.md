# VT-M2 交接回执

- task_id: M2
- owner: ebuilder（会话执行者）
- contract_version: VT-1
- base_sha: 747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc
- delivered_sha: 见 vps-migration 分支提交
- changed_files:
  - src/lib/translation/request-policy.ts（新增：policy 解析 / 有界 JSON 读取 / 滑动窗口 / 并发槽 / 进程级守卫）
  - src/lib/translation/request-policy.test.ts（新增：17 用例，lab_policy）
  - src/lib/translation/request-policy.orchestration.test.ts（新增：9 用例覆盖 VT04/VT06/VT07 编排语义）
  - src/lib/translation/translate.ts（修改：禁用 provider 结果、原子预占、请求级超时、finally 释放；保留既有结果协议与取消语义）
  - src/lib/translation/providers/agnes.ts（修改：AGNES_TIMEOUT_MS 有限上限；未配置回退 null 保持开发行为）
  - src/lib/translation/providers/agnes.test.ts（新增 2 用例）
  - src/app/api/translate/route.ts（修改：政策解析→有界读取→校验→429/413 映射；删除 Vercel 专用 maxDuration）
  - src/app/api/translate/route.test.ts（重写：10 用例，保留全部既有断言语义）
- dependency_shas: M1（health 路由的政策变量与 request-policy 一致）
- test_results:
  - npm run lint / typecheck / test:run（207 用例）/ build: 全部 PASS
  - VT03 mock：PASS（无效 400 / 超长与字节超限 413 / 去重 / 未知 provider 400 / 重复上游 0）
  - VT04 mock：PASS（Q2 五卡结果、单卡失败隔离、协议不变）
  - VT06 mock：PASS（请求级超时归类 TIMEOUT、取消传播、忽略 abort 的上游不永久占槽）
  - VT07 mock：PASS（槽满 429+Retry-After、窗口满 429 且槽回滚、已启动计数不退、5 卡原子预占）
  - VT05：NOT_RUN（M5；translator-workbench.test.ts 只读）
- evidence_paths: 本回执；测试输出见 CI
- blockers: 无
- rollback_notes: translate.ts/route.ts/agnes.ts 可从基线还原；request-policy 独立文件可直接删除

## 行为变化声明

1. Agnes 从无界等待改为 `AGNES_TIMEOUT_MS`（生产 120s，研究文档第三节建议路径；部署模式由 deep health 强制）。
2. 路由删除 `maxDuration=40`（Vercel 专用元数据；自托管由请求级超时接管）。
3. 生产配置缺任一保护变量 → translate API 503 POLICY_NOT_CONFIGURED + deep health 503，fail closed。

## 既有 8 类测试保持

原 route/translate/agnes/registry/validation/google-web/bing-web/translator-workbench 测试全部通过，未改前端交互与结果协议。
