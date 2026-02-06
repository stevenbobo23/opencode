# OpenCode 微信小程序

一个仿照 OpenCode 移动 Web 版设计的微信小程序，核心功能为 AI 聊天对话。

## 功能特性

- ✅ 用户登录和服务器配置
- ✅ 会话列表管理
- ✅ AI 聊天对话（支持流式响应）
- ✅ 实时消息流（SSE）
- ✅ 深色/浅色主题切换
- ✅ 响应式设计，仿照 OpenCode 移动端风格

## 项目结构

```
packages/miniprogram/
├── app.js                  # 小程序入口
├── app.json                # 全局配置
├── app.wxss                # 全局样式
├── project.config.json     # 项目配置
│
├── pages/                  # 页面
│   ├── login/             # 登录页
│   ├── index/             # 会话列表
│   ├── chat/              # 聊天页
│   └── settings/          # 设置页
│
├── components/             # 组件
│   └── loading/           # 加载组件
│
├── utils/                  # 工具函数
│   ├── api.js            # API 封装
│   ├── storage.js        # 本地存储
│   └── sse.js            # SSE 工具
│
└── styles/                 # 样式文件
    ├── variables.wxss     # CSS 变量
    ├── colors.wxss        # 颜色定义
    └── common.wxss        # 通用样式
```

## 快速开始

### 1. 安装微信开发者工具

下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

### 2. 导入项目

1. 打开微信开发者工具
2. 选择「导入项目」
3. 选择 `packages/miniprogram/` 目录
4. 填写 AppID（开发阶段可使用测试号）
5. 点击「导入」

### 3. 配置开发环境

由于项目使用内网地址 `http://192.168.101.86:6015`，需要：

1. 在微信开发者工具中，点击右上角「详情」
2. 在「本地设置」中，勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」

### 4. 启动 OpenCode 服务器

确保你的 OpenCode 服务器正在运行：

```bash
# 从 opencode 项目根目录
opencode serve --port 6015
```

### 5. 登录小程序

1. 在小程序中输入服务器地址：`http://192.168.101.86:6015`
2. 输入用户名和密码（根据你的服务器配置）
3. 点击「登录」

## 开发说明

### API 封装

所有 API 调用都通过 `utils/api.js` 统一管理：

```javascript
const { API } = require("../../utils/api")

// 示例：获取会话列表
const sessions = await API.session.list()

// 示例：发送消息
await API.message.send({
  sessionID: sessionId,
  role: "user",
  content: "Hello",
})
```

### SSE 流式响应

使用 `utils/sse.js` 处理服务器推送的流式消息：

```javascript
const { handleMessageStream } = require("../../utils/sse")

const sse = handleMessageStream(sessionId, {
  onMessage: (data) => {
    console.log("Received:", data)
  },
  onError: (err) => {
    console.error("Error:", err)
  },
})
```

### 本地存储

使用 `utils/storage.js` 管理本地数据：

```javascript
const { Storage, StorageKeys } = require("../../utils/storage")

// 保存数据
Storage.set(StorageKeys.SERVER_URL, "http://192.168.101.86:6015")

// 读取数据
const url = Storage.get(StorageKeys.SERVER_URL)

// 删除数据
Storage.remove(StorageKeys.CREDENTIALS)
```

### 主题系统

项目使用 CSS 变量实现主题系统，支持深色/浅色模式切换。

在 `styles/variables.wxss` 中定义所有设计令牌：

```css
:root {
  --background-base: #131010;
  --text-base: #f1ecec;
  --brand-primary: #fdffca;
  /* ... */
}
```

## 样式规范

### 颜色

- **背景色**: `#131010` (深色模式), `#fdfcfc` (浅色模式)
- **文字色**: `#f1ecec` (主要), `#b7b1b1` (次要), `#7f7979` (辅助)
- **品牌色**: `#fdffca` (Yuzu 黄色)
- **边框**: `#343030`

### 字号

- `11px` - 辅助文字
- `12px` - 小号文字
- `14px` - 正文（默认）
- `16px` - 大号文字
- `18px` - 标题

### 间距

- `4px` - 最小间距
- `8px` - 小间距
- `12px` - 默认间距
- `16px` - 大间距
- `24px` - 超大间距

## 注意事项

### 微信小程序限制

1. **网络请求**:
   - 开发时需开启「不校验合法域名」
   - 生产环境需要在微信小程序后台配置服务器域名

2. **存储限制**:
   - 单条数据限制 1MB
   - 总容量限制 10MB

3. **包大小限制**:
   - 主包 2MB
   - 总包 20MB

### SSE 支持

微信小程序原生不支持 SSE，本项目使用 `wx.request` + `onChunkReceived` 手动实现。

### 认证方式

当前使用模拟认证方式，实际使用时需要根据 OpenCode 的认证 API 进行调整。

## 后续优化

- [ ] 集成 Markdown 渲染（使用 towxml 或其他库）
- [ ] 支持代码高亮
- [ ] 支持图片上传
- [ ] 支持文件查看
- [ ] 添加更多主题选项
- [ ] 性能优化
- [ ] 单元测试

## 参考资源

- [OpenCode 移动端源码](../app/src/pages/)
- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [OpenCode SDK](../sdk/js/)

## 许可证

本项目遵循 OpenCode 主项目的许可证。
