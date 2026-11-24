# VT-M6/M7 交接回执（生产切流 + 观察交接）

- task_id: M6 + M7
- owner: ebuilder
- contract_version: VT-1
- base_sha: APP 91ce3d5 / INFRA 6e8fc57
- delivered_sha: 同上
- changed_files: 无新代码（执行 + 文档）
- test_results（生产真实执行）:
  - P2 正式证书：灰云窗口内 HTTP-01 自动签发。Lets Encrypt YE2，CN=tr.vastnext.com，2026-11-24 至 2027-02-22
  - P4 生产 prepare：PASS（release 91ce3d5-45457504534，探针 31250，环境=production）
  - P5 生产 promote：PASS，ACTIVE generation=1（acceptance 门禁、edge 锁、外网验证全通过）
  - DNS 切流：旧值 CNAME→vercel-dns-017（橙云）已存档；灰云（cert 签发+验证）→ 橙云恢复，record 2b2f84f08668a6cce643bb6c14f78072，最终 A 192.238.239.41 proxied=true ttl=300
  - VT09c CF 完整链路：health 200、/text 200（CF-RAY 边缘服务）；本地区域直连亦 200
  - VT15b 真实短句（经 CF 生产链路）：google「你好世界。」154ms；bing「你好，世界。」1403ms
  - FindryAI 回归：health 200（9e156ff 未变）、首页 200、state generation=9 完整
  - POST /api/translate 无缓存头且 POST 不被 CF 缓存（平台行为），VT09 缓存断言以「无共享缓存」方式满足
- evidence_paths:
  - /opt/site-infra/evidence/vt-cutover/dns-records-before.json
  - /opt/site-infra/evidence/vt-cutover/cutover-complete.json
  - /opt/site-infra/evidence/promote-91ce3d5-45457504534-1795548671508/promote.json
- blockers: 无
- rollback_notes: 生产回滚需 root 验收记录绑定目标 digest；首版无历史版本，恢复路径=重建同 digest

## 已验证命令附录（真实执行路径）

```bash
# 状态（deploy 通道）
ssh deploy@192.238.239.41 'sudo -n /usr/local/sbin/site-infra-release status --site vast-translator'

# 发布请求/审批生成（本地，APPROVAL_HMAC 环境变量）
node scripts/deploy/make-release.mjs --site vast-translator --environment production \
  --operation prepare|promote|rollback --release-id ID --git-sha SHA --image-digest DIGEST \
  --config-hash HASH --generation N --host-id vps-192-238-239-41 --approver ACTOR \
  --evidence-run-id RUN --out-dir .release
# 注意：preview 站点须补丁 request.image_repo = ghcr.io/vastnext/vast-translator

# 服务器执行（installer 通道或 CI deploy 通道）
sudo bash -c "PLATFORM_ROOT=/opt/site-infra /usr/local/sbin/site-infra-release \
  prepare|promote --request /etc/site-infra/requests/FILE --approval /etc/site-infra/approvals/FILE"
```

## DEFERRED / 残留风险（负责人明确）

| 项 | 说明 | 负责人 |
| --- | --- | --- |
| ~~Agnes 启用~~ | ✅ 已恢复（2026-11-24T20:05Z，用户供 key，agnes-2-5 实测成功；agnes-2-0 端点上游 429/5xx 为 apihub 容量条件，卡片可重试） | 已闭环 |
| 仓库 Secrets | APPROVAL_HMAC/VPS_SSH_KEY/VPS_HOST/VPS_USER/VPS_KNOWN_HOSTS 尚未设入 vast-translator 仓库（文件在 G:/Caches/Temp/opencode/vt-keys/）；设置前 CI 发布工作流不可用 | 用户/后续会话 |
| Vercel 项目暂停 | deploy.yml 已替换（自动化入口已消失）、Vercel Git 集成未连接（已核实）；CLI 无 pause 命令，建议用户在 dashboard 一键暂停作纵深防御 | 用户 |
| zone SSL=full | vastnext.com zone 为 full（非 strict）；源站已有有效证书，可升级 strict，但影响全 zone 需用户确认 | 用户 |
| 限流边界 | 每进程限流（10 并发/60/min）非供应商硬配额；Agnes 费用上限需用户在 apihub 控制面另行设置（agnes-2-0 已出现上游 429） | 用户 |
| 24h 观察 | M7 观察（5xx/资源/备份恢复点）由用户日常巡检或后续会话接续 | 用户/后续会话 |

## 最终状态

- tr.vastnext.com 生产 ACTIVE：release 91ce3d5-45457504534 / digest sha256:743f4c45...7641 / generation=1
- 镜像：ghcr.io/vastnext/vast-translator（私有），CI 构建+审计
- 入口：Cloudflare（橙云，Full）→ edge-caddy → vast-translator-91ce3d5 容器（127.0.0.1:31250）
- runtime secrets：/opt/site-infra/secrets/vast-translator.production.env（root 600）
- 调度：无 cron（翻译器无定时任务，契约约定）
