<h1 align="center">Dux AI Desktop</h1>

<p align="center">
  <strong>基于 Vue 3 + Tauri 2 的 Dux AI 桌面客户端</strong>
</p>

<p align="center">
  用桌面端方式连接 Dux AI 服务，统一处理会话、附件上传、流式回复与多窗口设置体验。
</p>

<p align="center">
  <a href="https://github.com/duxweb/dux-ai-desktop" target="_blank">GitHub</a> |
  <a href="https://github.com/duxweb/dux-ai-desktop/releases" target="_blank">Releases</a> |
  <a href="https://github.com/duxweb/dux-ai" target="_blank">Dux AI 服务端</a>
</p>

<p align="center">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.x-blue.svg" />
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-green.svg" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg" />
</p>

## 项目定位

Dux AI Desktop 不是一个独立的 AI 后端，而是 Dux AI 的桌面聊天客户端。

你可以把它理解成：

- 一个连接 Dux AI 服务端的桌面对话入口
- 一个支持智能体切换和会话管理的原生桌面客户端
- 一个支持图片、文档、视频附件发送的多媒体聊天工具
- 一个用于设置、关于、多窗口管理的轻量桌面壳层

它建立在 `Vue 3 + Tauri 2` 之上，所以天然具备：

- 跨平台桌面应用能力
- 原生窗口控制能力
- 本地配置持久化能力
- 与 Dux AI 服务端直接对接的能力

## 核心特性

- 智能体、会话、消息统一在一个桌面端里管理
- 支持文本、图片、文档、视频附件发送
- 支持流式消息回复
- 支持设置、关于等独立子窗口
- 支持 macOS 与 Windows 桌面打包发布
- 版本号可随 GitHub Release Tag 自动同步到构建产物

## 适合什么场景

- 想给 Dux AI 配一个轻量桌面聊天入口
- 想在 macOS 或 Windows 上直接使用 Dux AI 会话能力
- 想通过桌面端完成附件上传、消息追问和多窗口设置
- 想给团队内部提供一个独立桌面 AI 客户端

## 下载与安装

推荐直接从 GitHub Releases 下载对应系统的安装包：

- 仓库：`https://github.com/duxweb/dux-ai-desktop`
- Releases：`https://github.com/duxweb/dux-ai-desktop/releases`

当前发布目标：

- macOS ARM64
- macOS x64
- Windows x64

### macOS 提示“已损坏，无法打开”怎么办

如果 macOS 下载后提示：

```text
“Dux AI”已损坏，无法打开。你应该将它移到废纸篓。
```

这通常不是文件真的损坏，而是系统对未签名或未公证应用的隔离拦截。

可以在终端执行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/Dux\ AI.app
```

执行后再重新打开应用即可。

## 连接 Dux AI 服务端

桌面端首次打开时，如果尚未配置服务连接，会自动提示进入连接设置。

当前需要填写的配置项只有两项：

- 服务器地址
- Token

### 配置步骤

1. 打开桌面端右上角的“设置”窗口。
2. 在“服务器地址”中填写 Dux AI 服务地址，例如：

```text
http://127.0.0.1:8000
```

3. 在“Token”中填写服务端提供的访问令牌。
4. 点击“测试连接”，确认当前地址和 Token 可用。
5. 测试通过后点击“保存”。

### 连接成功后的表现

- 能正常拉取智能体列表
- 能加载历史会话
- 可以发送文本与附件消息

### 常见注意事项

- 服务器地址不要带结尾 `/`
- Token 会在保存时自动去掉首尾空格
- 如果测试连接成功但没有智能体，通常说明服务端当前还没有可用模型或智能体配置
- 如果桌面端无法连接，请优先确认服务端接口是否可从当前机器访问

## 本地开发

### 环境要求

- Node.js 22+
- pnpm 10+
- Rust 工具链
- Tauri 2 桌面构建环境

### 安装依赖

```bash
pnpm install
```

### 启动前端开发服务

```bash
pnpm dev
```

### 启动 Tauri 桌面开发

```bash
pnpm tauri dev
```

### 构建前端资源

```bash
pnpm build
```

## 自动发布

GitHub Actions 工作流文件：

```text
.github/workflows/release.yml
```

### 通过标签触发发布

```bash
git tag v0.1.0
git push origin v0.1.0
```

推送后会自动创建一个 GitHub Draft Release，并上传桌面安装包。

### 手动触发发布

打开 GitHub Actions，选择 `Release Desktop`，再填写 `tag_name`，例如：

```text
v0.1.0
```

### 版本号同步规则

发布工作流会在构建前自动把当前 Tag 版本同步到：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

例如：

- Tag：`v1.2.3`
- 实际打包版本：`1.2.3`

关于窗口里显示的版本号也会跟随当前应用实际版本。

## 开发说明

- 前端构建命令为 `pnpm build`
- Tauri CLI 入口命令为 `pnpm tauri`
- 自动发布使用 `tauri-apps/tauri-action`
- Windows 安装包需要在真实 Windows 环境或 GitHub Actions Windows runner 中构建
- macOS 图标依赖 `src-tauri/icons/icon.icns`
- Windows 图标依赖 `src-tauri/icons/icon.ico`

## 相关项目

- Dux AI：`https://github.com/duxweb/dux-ai`
- Dux AI 文档：`https://github.com/duxweb/dux-ai-docs`
- Dux PHP Admin：`https://github.com/duxweb/dux-php-admin`
- DVHA：`https://dvha.docs.dux.plus/`

## 开源协议

本项目基于 MIT 协议开源。
