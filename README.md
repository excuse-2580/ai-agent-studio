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
├── data/store.json     你的全部数据（已 gitignore）
├── start.bat / start.sh
└── package.json
```

## 数据备份

所有智能体、模型源、对话记录都存在 `data/store.json`。
「设置」→「导出全部数据」可导出 JSON，换机器时用「导入数据」恢复。

## 常见问题

**打不开页面？** 确认终端里服务已启动，端口没被占用；换端口用 `PORT=6000 npm start`。

**提示「还没有可用模型源」？** 先到「模型」页面添加并测试连接通过。

**本地模型连不上？** 确认 `llama-server` 正在运行、`--port` 与填写的地址一致；用 `curl http://127.0.0.1:8080/v1/models` 自检。

**想让局域网里的手机也访问？** 启动时加 `HOST=0.0.0.0`，然后用电脑的局域网 IP 访问。

## 许可

MIT
