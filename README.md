# 托育知护

面向托育机构人员和婴幼儿照护者的知识问答产品。打开即可提问，回答依据资料库中的政策、标准和照护指南，并标明出处。使用者不需要安装模型，也不需要看到检索、向量或本机模型这些实现细节。

# 环境与安装

require Node.js 20+

安装

```
npm install
npm run dev
```

训练数据
```
npm run childcare
```

可以阅读[项目架构介绍文档](AI_AGENT_README.md)了解详情，知识库导入时需要格式化，所以推荐让agent做这部分工作

# 运行与部署

调试可以使用
```
npm run dev
```

生产虽然说也可以调试进行运行，但也可以部署好前端，然后手动运行后端内容
```
npm run build
npx tsx apps/server/src/index.ts
```

# Nginx配置

配置模板

**tuoyu.nginx**

```
server {
    listen 80;
    listen [::]:80;
    server_name tuoyu.tenflake.cn;
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:4174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}

```

**tuoyu.service**

```
[Unit]
Description=托育知护
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/childcare-agent
Environment=PATH=/root/.nvm/versions/node/v24.21.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
Environment=CHILDCARE_DEPLOY=linux-4g
ExecStart=/root/.nvm/versions/node/v24.21.0/bin/npx tsx apps/server/src/index.ts
Restart=on-failure
RestartSec=3
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target

```

# 数据库覆写

服务器端跑数据训练工作效果鉴于服务器的性能原因可能效果不佳和速度很慢，这边推荐本地跑好数据推送到服务器上

```sh
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/childcare-agent}"
ARCHIVE="${2:-/tmp/tuoyu_data.tar}"
SERVICE_NAME="${3:-tuoyu}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "未找到数据包: $ARCHIVE" >&2
  exit 1
fi

systemctl stop "$SERVICE_NAME"
rm -f "$APP_DIR/data/childcare.db" "$APP_DIR/data/childcare.db-wal" "$APP_DIR/data/childcare.db-shm"
rm -rf "$APP_DIR/data/raw"
mkdir -p "$APP_DIR/data"
tar -xf "$ARCHIVE" -C "$APP_DIR"
rm -f "$ARCHIVE"
chmod 640 "$APP_DIR/data/childcare.db"
systemctl start "$SERVICE_NAME"
echo "数据已覆盖"
```