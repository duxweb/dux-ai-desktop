<h1 align="center">Dux AI Desktop</h1>

<p align="center">
  <strong>基于 Vue 3 + Tauri 2 的 Dux AI 桌面客户端</strong>
</p>

<p align="center">
  用桌面端方式连接 Dux AI 服务，统一处理会话、附件上传、流式回复与多窗口设置体验。
</p>

## 项目定位

Dux AI Desktop 不是一个独立的 AI 后端，而是 Dux AI 的桌面聊天客户端。

它主要负责这几件事：

- 连接 Dux AI 服务端
- 管理智能体与会话列表
- 发送文本、图片、文档、视频附件
- 在桌面端展示流式回复与消息记录
- 提供设置、关于等原生窗口体验

当前项目技术栈为：

- `Vue 3`
- `Vite`
- `Pinia`
- `Tauri 2`
- `Rust`

## 适合什么场景

- 想给 Dux AI 配一个轻量桌面聊天入口
- 想在 macOS 或 Windows 上直接使用 Dux AI 会话能力
- 想通过桌面端完成附件上传、消息追问和多窗口设置

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

## 桌面发布

GitHub Actions 工作流文件：

```text
.github/workflows/release.yml
```

### 通过标签触发发布

```bash
git tag v0.1.0
git push origin v0.1.0
```

推送后会自动创建一个 GitHub Draft Release，并上传以下桌面安装包：

- macOS ARM64
- macOS x64
- Windows x64

### 手动触发发布

打开 GitHub Actions，选择 `Release Desktop`，再填写 `tag_name`，例如：

```text
v0.1.0
```

### 当前打包目标

- macOS：`dmg`
- Windows：`nsis`

## 开发说明

- 前端构建命令为 `pnpm build`
- Tauri CLI 入口命令为 `pnpm tauri`
- 自动发布使用 `tauri-apps/tauri-action`
- Windows 安装包需要在真实 Windows 环境或 GitHub Actions Windows runner 中构建

## 相关项目

- Dux AI：`https://github.com/duxweb/dux-ai`
- Dux PHP Admin：`https://github.com/duxweb/dux-php-admin`

## 开源协议

本项目基于 MIT 协议开源。
