# 简单聊天室

一个基于Node.js和WebSocket的实时多用户聊天室应用。

## 功能特性

- 🚀 实时消息传输
- 👥 多用户同时在线
- 💬 公共聊天室
- 🎨 现代化UI设计
- 📱 响应式布局
- ⌨️ 输入状态提示
- 👤 用户昵称系统
- 📊 在线人数显示

## 技术栈

- **后端**: Node.js + Express + Socket.IO
- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **实时通信**: WebSocket

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

或者使用开发模式（自动重启）：

```bash
npm run dev
```

### 3. 访问应用

打开浏览器访问：http://localhost:3000

## 使用说明

1. 进入聊天室后，首先输入您的昵称
2. 点击"进入聊天室"按钮
3. 在输入框中输入消息，按回车或点击发送按钮发送
4. 可以同时打开多个浏览器标签页模拟多用户聊天

## 项目结构

```
simple-chatroom/
├── server.js          # 服务器主文件
├── package.json       # 项目配置和依赖
├── public/            # 前端静态文件
│   ├── index.html     # 主页面
│   ├── style.css      # 样式文件
│   └── script.js      # 前端JavaScript
└── README.md          # 项目说明
```

## API说明

### 服务器端事件

- `join`: 用户加入聊天室
- `message`: 发送消息
- `typing`: 用户输入状态
- `disconnect`: 用户断开连接

### 客户端事件

- `userJoined`: 用户加入通知
- `userLeft`: 用户离开通知
- `message`: 接收消息
- `userTyping`: 用户输入状态
- `onlineCount`: 在线人数更新
- `userList`: 在线用户列表

## 开发说明

### 添加新功能

1. 在 `server.js` 中添加服务器端事件处理
2. 在 `public/script.js` 中添加客户端事件监听
3. 在 `public/style.css` 中添加相应样式

### 自定义配置

可以在 `server.js` 中修改以下配置：

- 端口号：修改 `PORT` 变量
- 最大消息长度：修改前端 `maxlength` 属性
- 用户昵称长度：修改前端 `maxlength` 属性

## 许可证

MIT License
