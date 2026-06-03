# Serv00 部署 Sub2API 详细教程

## 前置准备

**需要的资源：**
- Serv00 账号（用户名记好，下面所有脚本都要替换）
- Serv00 Panel 访问权限
- SSH 连接到 Serv00 服务器的能力

**需要在 Panel 中提前完成：**
1. 创建一个端口给 Sub2API 用
2. 创建一个端口给 Redis 用
3. 在 Panel 的 PostgreSQL 入口创建数据库，记好：
   - 用户名
   - 密码
   - 数据库名
   - 主机地址（格式为 `pgsql13.serv00.com`，数字编号以你 Panel 显示的为准）
4. 绑定好域名后，在 Panel 中关闭对应域名的 **PoW 等安全设置**（不关的话 API 调用会被拦截）

---

## 第一步：准备目录结构

SSH 登录 Serv00 后，进入家目录：

```sh
cd /home/你的用户名
mkdir -p logs
mkdir -p redis
```

---

## 第二步：配置 Redis

在家目录创建 `redis.conf`：

```conf
# 监听地址（必须，否则默认只允许本地）
bind 0.0.0.0

# 使用面板创建的端口
port 你的redis端口

# 安全（强烈建议）
requirepass 你的redis密码

# 关闭保护模式（否则远程连不上）
protected-mode no

# 后台运行
daemonize yes

# 日志最小化
loglevel notice

# 数据目录（必须存在）
dir /usr/home/你的用户名/redis

# 不做持久化（最小配置）
save ""
appendonly no
```

**关键点：**
- `bind 0.0.0.0` 必须写，否则只允许本地连接
- `port` 用 Panel 申请的端口
- 不要写 `unixsocket` 和 `port 0`，会冲突
- `dir` 路径必须存在（前面已 mkdir）

启动 Redis：

```sh
redis-server /home/你的用户名/redis.conf
```

验证启动：

```sh
pgrep -f "redis-server.*redis.conf"
```

---

## 第三步：创建更新脚本（拉取二进制）

在家目录创建 `update.sh`，把 `USERNAME` 改成你的用户名：

```sh
#!/bin/sh

USERNAME='你的Serv00用户名'
WORK_DIR="/home/${USERNAME}"
LOG_FILE="${WORK_DIR}/update.log"

GITHUB_PROJECT='KiritoXDone/Sub2API-Freebsd'
BINARY_NAME='sub2api'

CURRENT_BINARY_PATH="${WORK_DIR}/${BINARY_NAME}"
VERSION_FILE="${WORK_DIR}/current_version.txt"
DOWNLOAD_PATH="${WORK_DIR}/${BINARY_NAME}.tar.gz"
EXTRACT_DIR="${WORK_DIR}/${BINARY_NAME}_extract"
RESTART_SCRIPT_PATH="${WORK_DIR}/restart.sh"

log_message() {
    level="$1"
    message="$2"
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "${timestamp} ${level}: ${message}" >> "${LOG_FILE}"
}

LOCAL_VERSION=""
if [ -f "${VERSION_FILE}" ]; then
    LOCAL_VERSION=$(cat "${VERSION_FILE}")
fi

API_URL="https://api.github.com/repos/${GITHUB_PROJECT}/releases/latest"
TEMP_JSON=$(mktemp)

log_message "INFO" "Fetching latest release from ${API_URL}"
curl -sL "${API_URL}" -o "${TEMP_JSON}"

LATEST_TAG=$(jq -r '.tag_name' "${TEMP_JSON}")
ASSET_URL=$(jq -r '.assets[] | select(.name | test("^sub2api_.*_freebsd_amd64\\.tar\\.gz$")) | .browser_download_url' "${TEMP_JSON}" | head -n 1)

rm -f "${TEMP_JSON}"

if [ -z "${LATEST_TAG}" ] || [ "${LATEST_TAG}" = "null" ]; then
    log_message "ERROR" "Failed to get latest tag"
    exit 1
fi

if [ -z "${ASSET_URL}" ] || [ "${ASSET_URL}" = "null" ]; then
    log_message "ERROR" "Failed to get asset url"
    exit 1
fi

if [ "${LATEST_TAG}" = "${LOCAL_VERSION}" ]; then
    log_message "INFO" "Already latest: ${LATEST_TAG}"
    exit 0
fi

log_message "INFO" "New version found: ${LATEST_TAG}"
log_message "INFO" "Stopping all processes of user ${USERNAME}"

pkill -kill -u "${USERNAME}"
sleep 2

log_message "INFO" "Downloading ${ASSET_URL}"
curl -L "${ASSET_URL}" -o "${DOWNLOAD_PATH}"
if [ $? -ne 0 ]; then
    log_message "ERROR" "Download failed"
    exit 1
fi

rm -rf "${EXTRACT_DIR}"
mkdir -p "${EXTRACT_DIR}"

log_message "INFO" "Extracting ${DOWNLOAD_PATH}"
tar -xzf "${DOWNLOAD_PATH}" -C "${EXTRACT_DIR}"
if [ $? -ne 0 ]; then
    log_message "ERROR" "Extract failed"
    rm -f "${DOWNLOAD_PATH}"
    rm -rf "${EXTRACT_DIR}"
    exit 1
fi

chmod +x "${EXTRACT_DIR}/${BINARY_NAME}"
mv -f "${EXTRACT_DIR}/${BINARY_NAME}" "${CURRENT_BINARY_PATH}"
if [ $? -ne 0 ]; then
    log_message "ERROR" "Replace binary failed"
    rm -f "${DOWNLOAD_PATH}"
    rm -rf "${EXTRACT_DIR}"
    exit 1
fi

echo "${LATEST_TAG}" > "${VERSION_FILE}"

rm -f "${DOWNLOAD_PATH}"
rm -rf "${EXTRACT_DIR}"

log_message "INFO" "Running restart script"
sh "${RESTART_SCRIPT_PATH}"
if [ $? -ne 0 ]; then
    log_message "ERROR" "Restart failed"
    exit 1
fi

log_message "INFO" "Update success: ${LATEST_TAG}"
exit 0
```

赋予执行权限并首次运行：

```sh
chmod +x update.sh
./update.sh
```

这个脚本第一次运行会下载最新版二进制，后续运行只在有新版本时才更新。可以加到 cron 做自动更新。

---

## 第四步：创建保活脚本

**`start.sh`**（启动 Redis + Sub2API）：

```sh
#!/bin/bash

BASE_DIR="/usr/home/你的用户名"
LOG_DIR="$BASE_DIR/logs"

mkdir -p "$LOG_DIR"

echo "[$(date)] Starting services..."

cd "$BASE_DIR" || exit 1

# ====== Redis ======
if pgrep -f "redis-server.*redis.conf" > /dev/null; then
    echo "Redis already running"
else
    echo "Starting Redis..."
    redis-server "$BASE_DIR/redis.conf" > "$LOG_DIR/redis.log" 2>&1 &
    echo $! > "$BASE_DIR/redis.pid"
    sleep 2
fi

# ====== Sub2API ======
if pgrep -f "$BASE_DIR/sub2api" > /dev/null; then
    echo "Sub2API already running"
else
    echo "Starting Sub2API..."
    ./sub2api > "$LOG_DIR/sub2api.log" 2>&1 &
    echo $! > "$BASE_DIR/sub2api.pid"
fi

echo "[$(date)] Done."
```

**`restart.sh`**（端口检测 + 拉起 start.sh）：

```sh
#!/bin/sh

PORT=你的sub2api端口

# Check if the port is in use
check_port() {
    sockstat -4l | grep ":${PORT}" >/dev/null 2>&1
    return $?
}

# Main logic
if check_port; then
    echo "Port ${PORT} is already in use. Exiting."
    exit 0
else
    echo "Port ${PORT} is not in use. Starting service..."
    nohup ./start.sh > "./startup.log" 2>&1 &
    echo "Started service using start.sh"
fi
```

赋予执行权限：

```sh
chmod +x start.sh restart.sh
```

---

## 第五步：初始化 Sub2API

**重要：不要直接提供 `config.yaml`，会启动失败。** 必须用引导模式：

```sh
./sub2api -setup
```

按引导依次填入：
1. **PostgreSQL 信息**：主机（`pgsql13.serv00.com`）、端口、数据库名、用户名、密码
2. **Redis 信息**：地址（`127.0.0.1`）、端口、密码（与 redis.conf 一致）
3. **初始管理员账号**：用户名、密码

完成后会生成配置文件，再次启动就能正常运行。

---

## 第六步：启动并验证

```sh
./restart.sh
```

检查是否监听端口：

```sh
sockstat -4l | grep 你的sub2api端口
```

查看日志：

```sh
tail -f logs/sub2api.log
tail -f logs/redis.log
```

---

## 第七步：配置 cron 实现自动保活

`crontab -e` 添加：

```cron
*/5 * * * * /home/你的用户名/restart.sh >/dev/null 2>&1
0 4 * * * /home/你的用户名/update.sh >/dev/null 2>&1
```

含义：
- 每 5 分钟检测端口，挂了就拉起
- 每天凌晨 4 点检查更新

---

## 部署后清单

- [ ] Panel 已申请 Sub2API 和 Redis 两个端口
- [ ] PostgreSQL 已创建并记录连接信息
- [ ] `redis.conf` 已写好且能启动
- [ ] `update.sh` 已成功拉取二进制
- [ ] `./sub2api -setup` 已完成初始化
- [ ] `start.sh` / `restart.sh` 已赋予执行权限
- [ ] `cron` 已配置保活和自动更新
- [ ] Panel 中域名的 **PoW 安全设置已关闭**
- [ ] 浏览器访问域名能打开管理后台

---

## 常见踩坑

1. **API 被拦截 / 返回奇怪 HTML**：去 Panel 关闭域名的 PoW
2. **Redis 远程连不上**：检查 `bind 0.0.0.0` 和 `protected-mode no`
3. **Sub2API 启动失败**：不要手动写 config，用 `-setup`
4. **端口检测失败**：确认 `restart.sh` 里的 `PORT` 改成了 sub2api 的端口，不是 redis 的
5. **路径混淆**：`/home/用户名` 和 `/usr/home/用户名` 在 Serv00 (FreeBSD) 上等价，但脚本里要保持一致

---

## 第八步：添加上游账号并在 Claude Code 中使用

以 `mimo-v2.5-pro` 模型为例。

### 8.1 登录 Sub2API 后台

浏览器访问 `https://你的域名`，用 `-setup` 时创建的管理员账号登录。

### 8.2 添加上游渠道

1. 左侧菜单找 **渠道（Channel）**
2. 点 **添加**
3. 填写：
   - **名称**：随便起，比如 `mimo-upstream`
   - **类型/Provider**：选对应的提供商（OpenAI 兼容格式选 OpenAI）
   - **Base URL**：上游 API 地址（提供商给的）
   - **API Key**：上游提供商给你的 Key
   - **模型**：手动填入 `mimo-v2.5-pro`
4. 保存

### 8.3 创建 API Token

1. 左侧菜单找 **令牌（Token）**
2. 点 **添加**
3. 填写：
   - **名称**：比如 `claude-code`
   - **模型权限**：勾选 `mimo-v2.5-pro`（或选全部）
   - **额度**：按需设置，或设为无限
4. 保存后 **复制生成的 Key**（只显示一次）

### 8.4 配置模型映射（关键）

Claude Code 发出的请求模型名是 `claude-sonnet-4-6` 这类，但上游实际模型是 `mimo-v2.5-pro`，需要做映射。

在 **渠道** 设置里找到模型映射 / Model Mapping，添加：

```
claude-sonnet-4-6 → mimo-v2.5-pro
claude-opus-4-7 → mimo-v2.5-pro
```

把所有 Claude Code 可能请求的模型名都映射到 `mimo-v2.5-pro`。部分版本支持通配符：

```
* → mimo-v2.5-pro
```

### 8.5 在 Claude Code 中配置

通过环境变量设置：

```sh
export ANTHROPIC_BASE_URL="https://你的Sub2API域名/v1"
export ANTHROPIC_API_KEY="sk-你刚才复制的Token"
```

或在 Claude Code 配置文件中：

```json
{
  "apiBaseUrl": "https://你的Sub2API域名/v1",
  "apiKey": "sk-你刚才复制的Token"
}
```

### 8.6 验证

在 Claude Code 里随便问个问题，能正常回复就说明链路通了。

如果报错，检查：
- Sub2API 后台 **日志** 页面，看请求是否进来、转发是否成功
- Token 的模型权限是否包含映射后的模型名
- 上游 Key 是否有效
- 域名的 PoW 是否已关闭
