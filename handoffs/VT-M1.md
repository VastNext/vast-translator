# VT-M1 交接回执

- task_id: M1
- owner: ebuilder（会话执行者）
- contract_version: VT-1
- base_sha: 747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc
- delivered_sha: 见 vps-migration 分支提交
- changed_files:
  - Dockerfile（新增：node:22.18.0-bookworm-slim，npm ci → next build（standalone）→ 非 root nextjs 运行，tini 入口，HEALTHCHECK /api/health）
  - .dockerignore（新增：排除 .git/.env/node_modules/docs/tests/handoffs）
  - next.config.ts（修改：NEXT_OUTPUT_MODE=standalone 时输出 standalone；Vercel/默认构建不受影响）
  - src/app/api/health/route.ts（新增，C2 契约）
  - src/app/api/health/route.test.ts（新增：7 用例）
  - config/env-manifest.json（新增：14 个变量，无值；next_public_frozen=[]）
  - scripts/deploy/app-smoke.mjs（新增：health/deep/text/home/static/404；translate-once 需双重批准标记）
  - tests/deploy/image.test.ts（新增：Dockerfile/.dockerignore 静态断言）
- dependency_shas: 无新运行依赖（package.json/lockfile 未改动）
- test_results:
  - npm run lint: PASS（0 错误 0 警告）
  - npm run typecheck: PASS
  - npm run test:run: PASS（12 文件 / 207 用例，含 health 7 用例）
  - npm run build（NEXT_OUTPUT_MODE=standalone）: PASS；/ 与 /text 静态，/api/health、/api/translate 动态
  - VT01 镜像构建/镜像审计：NOT_RUN（本地无 Docker；由 M4 GitHub Actions 构建后以 image-check.mjs 执行）
  - VT02 容器内健康探针：NOT_RUN（待候选容器）
- evidence_paths: 本回执 + CI 运行日志（待 M4）
- blockers: 无（镜像集成检查在 M4/M5 完成）
- rollback_notes: 还原 next.config.ts 并删除新增文件即可；不影响既有 Vercel 路径

## C2 关键实现

- 部署模式（APP_ENV=staging/production）缺 APP_RELEASE_ID/APP_GIT_SHA → 503 RELEASE_IDENTITY_MISSING。
- deep 只查配置存在性，upstream_calls 恒 0；生产政策变量任一缺失 → 503 CONFIG_MISSING。
- Cache-Control: no-store；runtime=nodejs；force-dynamic。

## HTML marker 实测（M1 第 5 步）

本地 standalone 构建 + 实际页面源码确认：`Vast Translator` 出现在每页 `<title>`（layout metadata）。M0 已冻结 home_marker=`Vast Translator`、home_path=`/text`。
