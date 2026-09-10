# DEPLOYMENT.md — 2027 Strategy 私测部署

**线上地址：** https://2027.craigyu.cn
**服务器：** bobvps (`43.128.111.182` / Tailscale `100.114.253.39`)
**部署日期：** 2026-09-10

---

## 1. 拓扑

```text
手机/浏览器
   │  https (Cloudflare 边缘证书 *.craigyu.cn，Google Trust Services)
   ▼
Cloudflare 代理 (2027.craigyu.cn → 43.128.111.182)
   │  https (源站证书: Let's Encrypt)
   ▼
nginx (bobvps :443 / :80)
   │  proxy_pass http://127.0.0.1:3317
   ▼
strategy-2027.service (systemd, User=ubuntu)
   └─ node --import tsx src/index.ts
        ├─ Hono API        /api/*
        └─ 静态 SPA        apps/web/dist  (WEB_DIST)
             └─ SQLite     packages/server/data/preview.sqlite
```

## 2. 服务管理

```bash
sudo systemctl status strategy-2027      # 状态
sudo systemctl restart strategy-2027     # 重启
sudo systemctl stop strategy-2027        # 停止
journalctl -u strategy-2027 -n 100 -f    # 日志
```

- 单元文件：`/etc/systemd/system/strategy-2027.service`
- 环境变量：`/etc/strategy-2027.env`（`chmod 600`，含 `ADMIN_TOKEN` / `APP_SECRET`）
- 已 `enable`：开机自启；`Restart=always` 崩溃自动拉起

## 3. nginx

- 站点配置：`/etc/nginx/conf.d/2027.craigyu.cn.conf`（本仓库同内容副本：`/home/ubuntu/deploy-2027/2027.craigyu.cn.conf`）
- 80 端口：ACME 校验路径 + 纯 HTTP 回源（Cloudflare SSL 模式为 Flexible 时可用）
- 443 端口：Let's Encrypt 证书 + 反代 `127.0.0.1:3317`
- 证书自动续期：`certbot.timer`（系统已启用）

## 4. 与生产前必须调整的项

| 项 | 现状（私测） | 上线前 |
|---|---|---|
| 数据库 | SQLite 文件 `data/preview.sqlite` | 备份策略 / 迁移评估 |
| LLM | `LLM_MODE=deterministic`（无密钥、零成本、输出保守） | 切 `live` + `DEEPSEEK_API_KEY` |
| 邮件 | console provider（只打日志） | SMTP/Resend + 发信域名 |
| 管理令牌 | 演示令牌 `preview-admin-token-0001` | 更换强随机令牌 |
| 应用密钥 | 演示 `APP_SECRET` | 更换并妥善保管（影响令牌哈希/加密） |
| 数据 | 合成演示数据 | 清空后开放 |

> `APP_SECRET` 与 `ENCRYPTION_KEY` 决定令牌哈希与答案加密；上线前必须换成正式值并备份，
> 否则重启后既有会话不可读。

## 5. CSRF/域名一致性（重要）

后端 `PUBLIC_ORIGIN` 必须与浏览器访问的源一致，否则写操作会被拒绝：

```ini
PUBLIC_ORIGIN=https://2027.craigyu.cn
```

改用其它域名时，同步更新 `/etc/strategy-2027.env` 并重启服务。

## 6. 快速自检

```bash
curl -s https://2027.craigyu.cn/api/health                 # {"ok":true,...}
curl -sI https://2027.craigyu.cn/ | head -1                # HTTP/2 200
echo | openssl s_client -connect 127.0.0.1:443 -servername 2027.craigyu.cn 2>/dev/null | openssl x509 -noout -issuer
```
