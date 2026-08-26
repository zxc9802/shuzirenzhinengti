# 数字人对口型智能工作台 (Digital Human Lip-sync Web Studio)

基于 **Next.js** 全栈技术栈、**IndexTTS-2** 中文克隆配音引擎与 **HeyGen Precision MCP 客户端** 构建的现代化数字人对口型 Web 平台。

## ✨ 核心特性

- **🎬 可视化制作台 (Studio)**：
  - 支持拖拽上传口播视频（MP4/MOV），内置 FFprobe 实时解析分辨率、时长、帧率及音频轨道。
  - 支持逐字口播文案输入与字数统计。
  - 参数调节：音调/语速模式（1.0× 标准 / 1.2× 提速）、画面适配策略（smart / preserve）、情绪强度调节（0.1~0.85）。
- **🔌 内置 MCP (Model Context Protocol) 客户端**：
  - 支持标准 MCP 协议（Direct、SSE/HTTP、Stdio 子进程三种通信模式）。
  - 支持工具发现与调试：`heygen_create_lipsync`、`heygen_get_lipsync`、`heygen_list_lipsyncs`。
  - 严格契约约束：固定 `precision` 模式、关闭背景乐/水印/动态时长，保障口型精细度与任务幂等防重复扣费。
- **🎙️ IndexTTS-2 语音克隆与音轨无损重混**：
  - 基于 302.AI IndexTTS-2 生成高质量中文定制配音。
  - 嘴部同步完成后，自动用原始生成的 IndexTTS-2 WAV 重新封装，保证交付成片音质纯正。
- **📊 左右分屏对比与证据链交付**：
  - 原视频 vs 对口型成片左右分屏同步播放。
  - 一键打包下载 `final.mp4`、`exact-final-indextts.wav` 及 `evidence.json`。

## 🚀 快速启动

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **启动开发服务器**：
   ```bash
   npm run dev
   ```
   打开浏览器访问 [http://localhost:3000](http://localhost:3000)。

3. **系统配置**：
   进入 **「系统配置」** (`/settings`) 页面填入您的 `302.AI API Key`、音色参考直链及 `HeyGen API Key` 即可开始使用。
