# AI Agent Studio

一个跑在你自己电脑上的 **AI 智能体工作台**：自由创建、删除、设定 AI 智能体，可以接**本地 .gguf 模型**，也可以接**任意云端大模型**。界面遵循 **Material Design 3**（含动态取色）。

- 零第三方依赖，只用 Node.js 内置模块，`clone` 下来直接跑
- 数据全部保存在本机（`data/store.json`），不上传任何服务器
- 手机 / 平板 / 桌面都能用（响应式：宽屏是侧边导航条，窄屏是底部导航栏）

---

## 快速开始

要求：**Node.js 18 及以上**（用到内置 `fetch`）。检查版本：`node -v`

```bash
git clone https://github.com/excuse-2580/ai-agent-studio.git
cd ai-agent-studio

# 方式一：npm
npm start

# 方式二：直接跑
node server/index.js
```

然后浏览器打开 **http://localhost:5178** 即可。

> 端口被占用？`PORT=6000 npm start`
> Windows 用户也可以直接双击 `start.bat`，macOS / Linux 双击 `start.sh`。

启动后终端会打印两个地址：

```
▸ 本机访问：  http://localhost:5178
▸ 手机访问：  http://192.168.1.10:5178   ← 同一个 WiFi 就能用
```

---

## 手机上使用

手机跑不动 llama.cpp，本地 `.gguf` 模型只能在电脑上跑，所以手机是"遥控器"的角色：界面在手机上，模型和对话在电脑上。

### 方式一：PWA（零安装，立刻能用）

1. 电脑和手机连**同一个 WiFi**
2. 电脑上启动服务（默认就监听了 `0.0.0.0`，不用额外配置）
3. 手机浏览器打开终端里打印的 **手机访问** 地址，例如 `http://192.168.1.10:5178`
4. 添加到主屏幕：
   - **Android Chrome**：右上角菜单 → 「安装应用」或「添加到主屏幕」
   - **iPhone Safari**：底部「分享」 → 「添加到主屏幕」
   - 也可以在 App 内「设置 → 安装」点按钮，会引导你操作

加完后桌面会出现小狼图标，点开是全屏无地址栏，跟装了个 App 一样。支持离线打开界面（Service Worker 已缓存应用外壳）。

> 局域网是 http（非 https），完整 WebAPK 安装可能受浏览器限制，此时"添加到主屏幕"会以快捷方式形式存在，功能完全一样。想要完整安装体验就走下面的 APK 方案。

### 方式二：编译成真正的安卓 APK

仓库里已经放好了 **[Capacitor](https://capacitorjs.com) 安卓工程**（`android/`），在你自己的电脑上编译即可产出可安装的 `.apk`。

前提：装好 [Android Studio](https://developer.android.com/studio)（含 Android SDK）和 JDK 17+。

```bash
git clone https://github.com/excuse-2580/ai-agent-studio.git
cd ai-agent-studio
npm install          # 装 Capacitor CLI

npm run sync:android # 把前端资源同步进安卓工程
npm run open:android # 用 Android Studio 打开工程
```

然后在 Android Studio 里 **Build → Build Bundle(s) / APK(s) → Build APK(s)**，
产物在 `android/app/build/outputs/apk/debug/app-debug.apk`，传到手机装就行。

也可以命令行直接出包：

```bash
npm run build:android   # 等价于 cap sync + ./gradlew assembleDebug
```

**第一次打开 APK 要填一次服务地址**：「设置 → 连接 → 服务地址」填入电脑上服务的地址（如 `http://192.168.1.10:5178`），点「测试连接」看到 ✅ 即可。之后就跟在电脑上用一样了。

> APK 里只有前端界面，不含 Node 服务（安卓跑不了），所以电脑上要开着服务；
> 如果你只想用云端 API，可以把服务部署到一台常开的机器（NAS / 小服务器 / 云主机）上，手机就随时能连。

### 手机本地跑模型（不依赖电脑）

想在手机里直接跑 `.gguf`、断网也能聊？看这份专门的手册：

**→ [docs/手机本地运行.md](docs/手机本地运行.md)**

一句话版本：装 Termux → 粘贴一行脚本 → 模型跑在手机里 → App 填 `http://127.0.0.1:8080/v1`。

> 注意：这条路径**必须用 APK**（PWA 连电脑的方案里，`127.0.0.1` 指的是电脑自己，够不到手机）。

### 手机上怎么连模型

| 你想用 | 怎么做 |
| --- | --- |
| 家里电脑的本地 `.gguf` | 电脑上跑着 `llama-server`，手机填电脑的局域网地址；数据不出家门，但要开着电脑 |
| 云端 API（DeepSeek / Kimi 等） | 手机上直接填云端密钥，随时随地能用 |

两种都支持，本来就是填地址的形式，随时切换。

---

## 三步上手

**1) 添加一个模型源**（「模型」页面 → 右下角 ➕）

本地和云端用的是同一套 OpenAI 兼容协议，所以只需要三样东西：**API 地址 + 密钥 + 模型名**。内置了这些预设，选一个填上密钥就行：

| 预设 | 地址 | 说明 |
|---|---|---|
| llama.cpp（本地 GGUF） | `http://127.0.0.1:8080/v1` | 加载本地 `.gguf` 文件 |
| Ollama（本地） | `http://127.0.0.1:11434/v1` | Ollama 本地服务 |
| LM Studio（本地） | `http://127.0.0.1:1234/v1` | LM Studio 本地服务 |
| OpenAI | `https://api.openai.com/v1` | GPT 系列 |
| DeepSeek | `https://api.deepseek.com/v1` | 中文强、便宜 |
| Moonshot（Kimi） | `https://api.moonshot.cn/v1` | 长上下文 |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | GLM 系列 |
| SiliconFlow | `https://api.siliconflow.cn/v1` | 聚合开源模型 |
| 自定义 | 自填 | 任何实现了 `/v1/chat/completions` 的服务 |

填完记得点 **「测试连接」**，会显示延迟并自动列出可用模型供你选择。

**2) 创建一个智能体**（「智能体」页面 → 右下角 ➕ 新建智能体）

每一项设定都能自由改：

- **名称 / 头像 / 主题色** —— 决定它在库里的样子
- **人设（系统提示词）** —— 核心设定，越具体它越懂你；内置 6 个模板可一键填充
- **开场白** —— 进入对话时它说的第一句话
- **绑定模型源** —— 每个智能体可以用不同的模型，也可以跟随默认
- **创造力 Temperature / Top P / 单次最大 Token / 携带历史条数** —— 用滑块调
- **标签** —— 方便在库中筛选

**3) 开聊**（「对话」页面）

支持逐字流式输出、Markdown 渲染（代码高亮块 + 一键复制）、思考过程展示（DeepSeek-R1 等推理模型）、重新生成、导出 Markdown。

---

## 接入本地 .gguf 模型

1. 安装 **llama.cpp**
   - macOS：`brew install llama.cpp`
   - Windows：`winget install llama.cpp`
   - 或到 [llama.cpp Releases](https://github.com/ggml-org/llama.cpp/releases) 下载预编译包
2. 把 `.gguf` 模型文件放到任意目录，例如 `~/models`
3. 在「模型」页面下方填入目录 → 点**扫描**，会列出所有 `.gguf`（含体积、参数量、量化格式）
4. 点**「启动命令」**，设置端口、上下文长度、GPU 层数后复制命令到终端执行，例如：

   ```bash
   llama-server -m ~/models/qwen2.5-7b-instruct-q4_k_m.gguf -c 4096 --port 8080 --host 127.0.0.1 -ngl 35
   ```

5. 回到顶部添加模型源，类型选 **llama.cpp**，地址填 `http://127.0.0.1:8080/v1`，测试通过即可开聊

> 显存不够：把 `-ngl`（GPU 层数）调小，或设为 `0` 纯 CPU 运行
> 内存吃紧：把 `-c`（上下文长度）调小

---

## 界面与设置

「设置」页面可以改：

- **主题**：浅色 / 深色 / 跟随系统
- **主色**：Material You 风格的动态取色，换一个种子色整站配色跟着变
- **界面缩放**：85% ~ 135%
- **流式输出**开关、**思考过程**显示开关
- **GGUF 扫描目录**
- **导出 / 导入 JSON 备份**、恢复出厂设置

---

## 目录结构

```
ai-agent-studio/
├── server/
│   ├── index.js        HTTP 服务与 API 路由（零依赖）
│   ├── store.js        数据层（JSON 持久化）
│   ├── providers.js    模型调用：OpenAI 兼容协议 + SSE 流式解析
│   └── gguf.js         .gguf 扫描、参数推断与启动命令生成
├── public/
│   ├── index.html
│   ├── css/            MD3 design tokens + 组件样式
│   └── js/             视图、组件、Markdown 渲染、主题
├── android/            Capacitor 安卓工程（编译 APK 用）
├── tools/              图标生成脚本
├── data/store.json     你的全部数据（已 gitignore）
├── start.bat / start.sh
├── capacitor.config.json
└── package.json
```

## 数据备份

所有智能体、模型源、对话记录都存在 `data/store.json`。
「设置」→「导出全部数据」可导出 JSON，换机器时用「导入数据」恢复。

## 常见问题

**打不开页面？** 确认终端里服务已启动，端口没被占用；换端口用 `PORT=6000 npm start`。

**提示「还没有可用模型源」？** 先到「模型」页面添加并测试连接通过。

**本地模型连不上？** 确认 `llama-server` 正在运行、`--port` 与填写的地址一致；用 `curl http://127.0.0.1:8080/v1/models` 自检。

**想让局域网里的手机也访问？** 服务默认就监听 `0.0.0.0`，直接用终端打印的「手机访问」地址即可。

**手机上打不开手机访问地址？** 检查：电脑和手机是否同一 WiFi；电脑防火墙是否放行了这个端口；服务是否还在运行。

## 许可

MIT

## 原生安卓 App（llama.cpp 编进 APK，真离线）

仓库里的 **`android-native/`** 是一个完整的原生安卓工程：

- **Kotlin + Jetpack Compose + Material Design 3**
- **llama.cpp 通过 JNI 编进 APK**（`ggml_jni.cpp` + CMake → 单个 `libggml-jni.so`）
- 勾选「手机本地 GGUF」→ 选 `.gguf` → 点加载，**离线 CPU 推理**
- **不依赖 Termux、不依赖电脑、不用联网**
- 云端侧：DeepSeek / Kimi / 智谱 / 硅基流动 / OpenAI 一键填写，
  以及 Ollama、llama.cpp server、腾讯混元（TC3-HMAC-SHA256 签名）

详细看：**[android-native/README.md](android-native/README.md)**

### 让 GitHub 云端帮你编译 APK

根目录的 `build-android.yml` 是现成的自动构建流水线。搬一下位置就能用：

1. 打开仓库页面 → 右上角 **"+" → Create new file**
2. 文件名填 `.github/workflows/build-android.yml`
3. 把根目录 `build-android.yml` 里 `-----` 之间的内容粘进去 → **Commit**
4. **Actions** 看进度 → 几分钟后 **Releases** 下载 `app-debug.apk`

> 云端机器自带 JDK / Android SDK / NDK，会把 llama.cpp 交叉编译进 APK。
> 模型文件不包含在 APK 里，装好后在 App 里选一个 `.gguf` 即可。

