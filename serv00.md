
### 拉取二进制文件  

这里提供更新脚本, 第一次使用和后续更新都可使用 

```sh
#!/bin/sh

USERNAME='你的 Serv00 用户名'
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

### redis 配置  

Serv00 是支持使用 redis 的, 只要自己配置 conf 就能使用  

这里提供一份模板供参考  

```conf
# 监听地址（必须，否则默认只允许本地）
bind 0.0.0.0

# 使用面板创建的端口（自行替换）
port 你的 redis 端口

# 关闭 unixsocket（否则冲突）
# port 0   ← 不要写
# unixsocket /path/to.sock ← 不要写

# 安全（强烈建议）
requirepass 你的 redis 密码

# 关闭保护模式（否则远程连不上）
protected-mode no

# 后台运行（可选）
daemonize yes

# 日志最小化
loglevel notice

# 数据目录（必须存在）
dir /usr/home/你的 Serv00 用户名/redis

# 不做持久化（最小配置）
save ""
appendonly no
```

### PGSQL 配置  

在 panel 中, 有 pqsql 的入口, 所以直接去添加并记好用户名, 密码等  

注: pgsql 的地址为 pgsql13.serv00.com 格式  

### 初始化

首先要 `redis-server redis.conf` 启动 redis 

我自己尝试直接提供 config.yaml 来启动, 但是不识别, 启动不起来, 所以推荐通过 `/sub2api -setup` 来完成初始化  

根据引导逐步填入 pgsql 和 redis 的信息, 还有初始管理员账号的信息, 即可正常运行  

### 保活脚本  

最近 Serv00 不怎么杀服务了, 不过还是提供一下保活脚本  

start.sh

```sh
#!/bin/bash

BASE_DIR="/usr/home/你的 Serv00 用户名"
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

restart.sh

```sh
#!/bin/sh

PORT=你的端口号

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

### 补充  

绑定好域名记得在 Panel 里把对应域名的 PoW 等安全设置都关闭, 不然调用 API 会被拦截
