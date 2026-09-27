#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
#  AI Agent Studio · 手机本地模型一键部署脚本（Termux）
#
#  在安卓手机的 Termux 里跑一个本地大模型服务，让 APK 直接连 127.0.0.1 推理，
#  全程离线、不出手机、不依赖电脑。
#
#  用法（Termux 里粘贴执行）：
#    bash <(curl -sL https://raw.githubusercontent.com/excuse-2580/ai-agent-studio/main/tools/termux-setup.sh)
#
#  可选参数：
#    --ollama     用 Ollama（免编译，几分钟搞定）
#    --llamacpp   用 llama.cpp（源码编译，可控性最强）
#    --port 8080  指定端口
# ============================================================================

set -uo pipefail

PORT=8080
MODE=""
MODEL_CHOICE=""
WORK="$HOME/aas-local"
HF="https://hf-mirror.com"   # 国内镜像；访问不了就换成 https://huggingface.co

C_RESET='\033[0m'; C_B='\033[1m'; C_G='\033[32m'; C_Y='\033[33m'; C_R='\033[31m'; C_C='\033[36m'

say()  { printf "${C_C}▸${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_G}✓${C_RESET} %s\n" "$*"; }
warn() { printf "${C_Y}!${C_RESET} %s\n" "$*"; }
err()  { printf "${C_R}✗${C_RESET} %s\n" "$*" >&2; }
head() { printf "\n${C_B}%s${C_RESET}\n" "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ollama)   MODE=ollama; shift ;;
    --llamacpp) MODE=llamacpp; shift ;;
    --port)     PORT="${2:-8080}"; shift 2 ;;
    -h|--help)  sed -n '2,20p' "$0"; exit 0 ;;
    *) shift ;;
  esac
done

# ---------------------------------------------------------------------------
# 0. 环境检查
# ---------------------------------------------------------------------------
head "① 检查环境"

if [[ ! -d /data/data/com.termux ]]; then
  err "这个脚本只能在安卓的 Termux 里运行。"
  exit 1
fi
ok "运行在 Termux 中"

ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  warn "检测到架构 $ARCH（不是 arm64），速度会明显偏慢，也可能编译失败。"
else
  ok "架构：$ARCH（arm64，OK）"
fi

MEM_GB=$(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo)
ok "可用内存约 ${MEM_GB} GB"
if awk "BEGIN{exit !($MEM_GB < 4)}"; then
  warn "内存偏小，建议只跑 1B 模型，并把上下文调小（-c 1024）。"
fi

CWD=$(pwd)
if [[ "$CWD" != "$HOME"* ]]; then
  warn "当前目录 $CWD 不在家目录下。"
  warn "安卓在外部存储（/sdcard）上禁止加执行权限，编译一定报 Permission Denied。"
  cd "$HOME" || exit 1
  ok "已切到 $HOME"
fi

# ---------------------------------------------------------------------------
# 1. 选择方案
# ---------------------------------------------------------------------------
head "② 选择方案"

if [[ -z "$MODE" ]]; then
  echo "  1) Ollama    —— 免编译，几分钟能跑，模型管理省事（推荐先试这个）"
  echo "  2) llama.cpp —— 源码编译（约 10-30 分钟），可控性最强、参数最全"
  printf "选哪个？[1/2，默认 1] "
  read -r pick
  [[ "$pick" == "2" ]] && MODE=llamacpp || MODE=ollama
fi
ok "方案：$MODE"

# ---------------------------------------------------------------------------
# 2. 装依赖
# ---------------------------------------------------------------------------
head "③ 安装依赖"

# 换到可达的镜像源（失败也不致命，继续用默认源）
if command -v termux-change-repo >/dev/null 2>&1; then
  say "如果后面下载很慢，可以另开一个终端执行 termux-change-repo 换镜像"
fi

export DEBIAN_FRONTEND=noninteractive
pkg update -y >/dev/null 2>&1 || warn "pkg update 有告警，继续尝试"
pkg upgrade -y >/dev/null 2>&1 || true

if [[ "$MODE" == "ollama" ]]; then
  pkg install -y ollama curl >/dev/null 2>&1 || pkg install -y ollama curl
  command -v ollama >/dev/null 2>&1 && ok "Ollama 已就绪" || { err "Ollama 安装失败"; exit 1; }
else
  pkg install -y git cmake clang make wget curl libandroid-spawn >/dev/null 2>&1 \
    || pkg install -y git cmake clang make wget curl libandroid-spawn
  for b in git cmake clang wget; do
    command -v "$b" >/dev/null 2>&1 && ok "$b 就绪" || { err "$b 缺失"; exit 1; }
  done
fi

mkdir -p "$WORK"
cd "$WORK" || exit 1

# ---------------------------------------------------------------------------
# 3. 挑模型
# ---------------------------------------------------------------------------
head "④ 选择模型"

declare -a NAMES URLS SIZES
NAMES+=("Qwen2.5-1.5B-Instruct Q4_K_M（约 1GB · 中文好 · 最稳）")
URLS+=("$HF/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf")
SIZES+=("1.0GB")

NAMES+=("Llama-3.2-1B-Instruct Q4_K_M（约 0.8GB · 英文强 · 最快）")
URLS+=("$HF/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf")
SIZES+=("0.8GB")

NAMES+=("Qwen2.5-3B-Instruct Q4_K_M（约 2GB · 需要 8GB 内存）")
URLS+=("$HF/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf")
SIZES+=("2.0GB")

NAMES+=("Llama-3.2-3B-Instruct Q4_K_M（约 2GB · 需要 8GB 内存）")
URLS+=("$HF/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf")
SIZES+=("2.0GB")

echo
for i in "${!NAMES[@]}"; do printf "  %d) %s\n" "$((i+1))" "${NAMES[$i]}"; done
echo "  5) 我自己填下载链接"
echo "  6) 我手机上已经有 .gguf 文件了，直接用"

if [[ -z "$MODEL_CHOICE" ]]; then
  printf "选哪个？[1-5，默认 1] "
  read -r sel
  [[ -z "$sel" ]] && sel=1
else
  sel="$MODEL_CHOICE"
fi

if [[ "$sel" == "6" ]]; then
  echo "提示：如果文件在手机存储里，先执行 termux-setup-storage 授权，"
  echo "      然后用 cp /sdcard/Download/xxx.gguf $WORK/ 拷进来。"
  printf "填写已有的 .gguf 完整路径： "
  read -r LOCAL_GGUF
  LOCAL_GGUF="${LOCAL_GGUF/#\~/\$HOME}"
  [[ -f "$LOCAL_GGUF" ]] || { err "找不到这个文件：$LOCAL_GGUF"; exit 1; }
  MODEL_FILE="$LOCAL_GGUF"
  ok "使用本地模型：$MODEL_FILE"
  SKIP_DOWNLOAD=1
elif [[ "$sel" == "5" ]]; then
  printf "粘贴 .gguf 直链： "
  read -r CUSTOM_URL
  [[ -z "$CUSTOM_URL" ]] && { err "链接不能为空"; exit 1; }
  URLS+=("$CUSTOM_URL")
  sel=$(( ${#URLS[@]} ))
fi

if [[ "${SKIP_DOWNLOAD:-0}" != "1" ]]; then
  MODEL_URL="${URLS[$((sel-1))]}"
  MODEL_FILE="$WORK/$(basename "${MODEL_URL%%\?*}")"
  ok "模型：$MODEL_FILE"
fi

# ---------------------------------------------------------------------------
# 4. 下载模型
# ---------------------------------------------------------------------------
head "⑤ 下载模型（几个 GB，建议连 WiFi 并保持屏幕常亮）"

if [[ "${SKIP_DOWNLOAD:-0}" == "1" ]]; then
  ok "使用本地模型文件，跳过下载"
elif [[ -f "$MODEL_FILE" ]]; then
  ok "模型已存在，跳过下载"
else
  # 逐个尝试镜像：国内镜像 → 官方 → 备用镜像
  MIRRORS=("$MODEL_URL")
  MIRRORS+=("${MODEL_URL/hf-mirror.com/huggingface.co}")
  MIRRORS+=("${MODEL_URL/huggingface.co/hf-mirror.com}")

  GOT=0
  for url in "${MIRRORS[@]}"; do
    [[ "$url" == "$MODEL_URL" ]] || say "换个镜像再试：$(echo "$url" | cut -d/ -f3)"
    rm -f "$MODEL_FILE.part"
    if wget -c --tries=2 --timeout=45 "$url" -O "$MODEL_FILE.part"; then
      mv "$MODEL_FILE.part" "$MODEL_FILE"
      GOT=1
      break
    fi
  done

  if [[ "$GOT" != "1" ]]; then
    rm -f "$MODEL_FILE.part"
    err "自动下载失败了。换手动方式："
    err "  1. 手机浏览器打开 https://hf-mirror.com 搜模型名，复制 .gguf 的直链"
    err "  2. 或者电脑上下载后，把 .gguf 拷进手机存储，再 termux-setup-storage 后用 cp 拷到 $WORK"
    err "  3. 拷好之后重跑本脚本，选「我自己填下载链接」时改成本地路径也行"
    exit 1
  fi
  ok "下载完成：$(du -h "$MODEL_FILE" | cut -f1)"
fi

# ---------------------------------------------------------------------------
# 5. 准备引擎
# ---------------------------------------------------------------------------
head "⑥ 准备推理引擎"

if [[ "$MODE" == "ollama" ]]; then
  ok "Ollama 模式无需编译"
  ENGINE="ollama"
else
  if [[ ! -x "$WORK/llama.cpp/build/bin/llama-server" ]]; then
    say "克隆 llama.cpp（浅克隆，省流量）"
    [[ -d "$WORK/llama.cpp" ]] || git clone --depth 1 https://github.com/ggml-org/llama.cpp.git "$WORK/llama.cpp" \
      || { err "克隆失败，检查网络"; exit 1; }

    cd "$WORK/llama.cpp" || exit 1
    say "配置编译（这一步几分钟）"
    cmake -B build -DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
      >/dev/null 2>&1 || { err "cmake 配置失败"; exit 1; }

    say "编译 llama-server（手机上约 10-30 分钟，请插电、别锁屏）"
    cmake --build build --config Release -t llama-server -j"$(nproc 2>/dev/null || echo 4)" \
      || { err "编译失败。常见原因：内存不足，或不在家目录下编译"; exit 1; }
    ok "编译完成"
  else
    ok "已编译过，跳过"
  fi
  ENGINE="$WORK/llama.cpp/build/bin/llama-server"
fi

cd "$WORK" || exit 1

# ---------------------------------------------------------------------------
# 6. 生成启停脚本
# ---------------------------------------------------------------------------
head "⑦ 生成启动脚本"

if [[ "$MODE" == "ollama" ]]; then
  cat > "$WORK/start.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# 启动手机本地模型服务（Ollama 模式）
export OLLAMA_HOST=127.0.0.1:${PORT}
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
ollama serve
EOF
else
  # 新版 llama.cpp 加了 --cors-origins；老版本没有这个参数，硬加会启动失败，所以先探测
  CORS_FLAG=""
  if "${ENGINE}" --help 2>&1 | grep -q "cors-origins"; then
    CORS_FLAG="--cors-origins http://127.0.0.1:${PORT} --cors-origins https://localhost"
    ok "检测到 --cors-origins，已放开本机页面的跨域"
  else
    say "这个版本没有 --cors-origins（老版本默认就允许跨域），跳过"
  fi

  cat > "$WORK/start.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# 启动手机本地模型服务（llama.cpp 模式）
CORES=\$(nproc 2>/dev/null || echo 4)
THREADS=\$(( CORES > 6 ? 6 : CORES ))   # 手机别占满所有核，会过热降频
exec "${ENGINE}" \\
  -m "${MODEL_FILE}" \\
  --host 127.0.0.1 --port ${PORT} \\
  -c 2048 \\
  -t "\$THREADS" \\
  --batch-size 512 --ubatch-size 512 \\
  -ngl 0 \\
  ${CORS_FLAG} \\
  --log-disable
EOF
fi
chmod +x "$WORK/start.sh"

cat > "$WORK/stop.sh" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
pkill -f "llama-server" 2>/dev/null
pkill -f "ollama serve" 2>/dev/null
echo "已停止本地模型服务"
EOF
chmod +x "$WORK/stop.sh"
ok "start.sh / stop.sh 已生成"

# 开机自启（需要装 Termux:Boot）
mkdir -p "$HOME/.termux/boot" 2>/dev/null
if [[ -d "$HOME/.termux/boot" ]]; then
  cat > "$HOME/.termux/boot/start-aas.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
bash "$WORK/start.sh" >> "$WORK/server.log" 2>&1 &
EOF
  chmod +x "$HOME/.termux/boot/start-aas.sh"
  ok "已写入开机自启（需安装 Termux:Boot 才会生效）"
fi

# ---------------------------------------------------------------------------
# 7. 启动并自检
# ---------------------------------------------------------------------------
head "⑧ 启动服务"

pkill -f "llama-server" 2>/dev/null
pkill -f "ollama serve" 2>/dev/null
sleep 1

termux-wake-lock 2>/dev/null && say "已申请唤醒锁（防止锁屏被杀）"

nohup bash "$WORK/start.sh" > "$WORK/server.log" 2>&1 &
SRV_PID=$!
ok "服务进程已拉起（PID $SRV_PID）"

say "等模型加载（首次可能要 30-60 秒）…"
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/v1/models" -o /tmp/aas_models.json 2>/dev/null; then
    ok "服务已就绪！"
    break
  fi
  sleep 2
done

if [[ ! -s /tmp/aas_models.json ]]; then
  err "服务没起来。看日志： tail -50 $WORK/server.log"
  exit 1
fi

MODEL_ID=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/aas_models.json | head -1)
ok "模型 ID：${MODEL_ID:-（未知，填 local-model 即可）}"

# ---------------------------------------------------------------------------
# 8. 收尾提示
# ---------------------------------------------------------------------------
head "🎉 搞定！"
cat <<EOF

  请在 AI Agent Studio App 里这样填：

    设置 → 连接 → 服务地址：  留空（APK 模式本来就在本机）
    模型 → 添加模型源：
        类型：本地模型 · llama.cpp (GGUF)
        地址：http://127.0.0.1:${PORT}/v1
        密钥：留空
        模型：${MODEL_ID:-local-model}

  常用命令：
    bash $WORK/start.sh        # 启动
    bash $WORK/stop.sh         # 停止
    tail -f $WORK/server.log   # 看日志

  三个必看的坑：
    1. 系统设置里把 Termux 的电池策略设为「无限制」，否则锁屏就被杀
    2. 多任务界面把 Termux 往下划锁住（防后台清理）
    3. 连续跑几分钟手机会发热降频，这是正常的，让它歇一会

  模型是 1.5B 左右的小模型，适合短问答、翻译、润色；
  别指望它有电脑端 7B/70B 的水平。
EOF

exit 0
