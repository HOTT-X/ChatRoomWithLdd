/**
 * 聊天室服务器
 * 使用Express和Socket.IO实现实时聊天功能
 * 支持用户注册登录和多聊天室
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

// 导入数据库和认证模块
const { initializeDatabase, User, Chatroom, Message } = require('./database');
const { registerUser, loginUser, requireAuth, requireAuthSocket, verifySession } = require('./auth');

const app = express();
const server = http.createServer(app);

// 日志工具函数
function log(message) {
    const timestamp = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    console.log(`[${timestamp}] ${message}`);
}

// 配置会话中间件
app.use(session({
    secret: 'chatroom-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // 在生产环境中应该设置为true（需要HTTPS）
        maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
}));

// 配置Socket.IO
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 配置Socket.IO使用会话中间件
io.use((socket, next) => {
    // 使用现有的会话中间件
    session({
        secret: 'chatroom-secret-key-2024',
        resave: false,
        saveUninitialized: false,
        cookie: { 
            secure: false,
            maxAge: 24 * 60 * 60 * 1000
        }
    })(socket.request, {}, next);
});

// 解析JSON请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 存储在线用户和聊天室
const onlineUsers = new Map(); // socketId -> userInfo
const chatroomUsers = new Map(); // chatroomId -> Set of socketIds
const typingUsers = new Map(); // chatroomId -> Map of socketId -> userInfo

/**
 * API路由 - 用户认证
 */

// 用户注册
app.post('/api/register', async (req, res) => {
    try {
        const result = await registerUser(req.body);
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// 用户登录
app.post('/api/login', async (req, res) => {
    try {
        const result = await loginUser(req.body);
        req.session.userId = result.user.id;
        req.session.username = result.user.username;
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// 用户登出
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: '登出失败' });
        }
        res.json({ success: true, message: '登出成功' });
    });
});

// 获取当前用户信息
app.get('/api/user', requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
});

/**
 * API路由 - 聊天室管理
 */

// 获取所有公开聊天室
app.get('/api/chatrooms', async (req, res) => {
    try {
        // 尝试从session获取用户ID
        const userId = req.session?.userId || null;
        const chatrooms = await Chatroom.getAllPublic(userId);
        
        // 添加实时在线人数
        const chatroomsWithOnlineCount = chatrooms.map(room => ({
            ...room,
            online_count: chatroomUsers.has(room.id) ? chatroomUsers.get(room.id).size : 0
        }));
        
        res.json({ success: true, chatrooms: chatroomsWithOnlineCount });
    } catch (error) {
        res.status(500).json({ success: false, message: '获取聊天室列表失败' });
    }
});

// 置顶聊天室
app.post('/api/chatrooms/:id/pin', requireAuth, async (req, res) => {
    try {
        const chatroomId = parseInt(req.params.id);
        const userId = req.user.id;
        
        const success = await Chatroom.pinChatroom(userId, chatroomId);
        if (success) {
            res.json({ success: true, message: '聊天室已置顶' });
        } else {
            res.status(500).json({ success: false, message: '置顶失败' });
        }
    } catch (error) {
        console.error('置顶聊天室失败:', error);
        res.status(500).json({ success: false, message: '置顶失败' });
    }
});

// 取消置顶聊天室
app.delete('/api/chatrooms/:id/pin', requireAuth, async (req, res) => {
    try {
        const chatroomId = parseInt(req.params.id);
        const userId = req.user.id;
        
        log(`用户 ${req.user.nickname} 尝试取消置顶聊天室 ${chatroomId}`);
        
        const success = await Chatroom.unpinChatroom(userId, chatroomId);
        if (success) {
            log(`用户 ${req.user.nickname} 成功取消置顶聊天室 ${chatroomId}`);
            res.json({ success: true, message: '已取消置顶' });
        } else {
            log(`用户 ${req.user.nickname} 取消置顶聊天室 ${chatroomId} 失败`);
            res.status(500).json({ success: false, message: '取消置顶失败' });
        }
    } catch (error) {
        log(`取消置顶聊天室失败: ${error.message}`);
        res.status(500).json({ success: false, message: '取消置顶失败' });
    }
});

// 获取用户信息
app.get('/api/user/info', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                email: user.email,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({ success: false, message: '获取用户信息失败' });
    }
});

// 更新用户头像
app.put('/api/user/avatar', requireAuth, async (req, res) => {
    try {
        const { avatar } = req.body;
        const userId = req.user.id;
        
        if (!avatar) {
            return res.status(400).json({ success: false, message: '头像URL不能为空' });
        }
        
        // 更新用户头像
        await User.updateAvatar(userId, avatar);
        
        res.json({ success: true, message: '头像更新成功' });
    } catch (error) {
        console.error('更新头像失败:', error);
        res.status(500).json({ success: false, message: '更新头像失败' });
    }
});

// 创建新聊天室
app.post('/api/chatrooms', requireAuth, async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: '聊天室名称不能为空' });
        }

        const chatroom = await Chatroom.create({
            name: name.trim(),
            description: description ? description.trim() : '',
            created_by: req.user.id,
            is_public: true
        });

        // 将创建者添加到聊天室
        await Chatroom.addMember(chatroom.id, req.user.id);

        res.json({ success: true, chatroom });
    } catch (error) {
        res.status(500).json({ success: false, message: '创建聊天室失败' });
    }
});

// 加入聊天室
app.post('/api/chatrooms/:id/join', requireAuth, async (req, res) => {
    try {
        const chatroomId = parseInt(req.params.id);
        const chatroom = await Chatroom.findById(chatroomId);
        
        if (!chatroom) {
            return res.status(404).json({ success: false, message: '聊天室不存在' });
        }

        await Chatroom.addMember(chatroomId, req.user.id);
        res.json({ success: true, message: '加入聊天室成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '加入聊天室失败' });
    }
});

// 获取聊天室成员
app.get('/api/chatrooms/:id/members', requireAuth, async (req, res) => {
    try {
        const chatroomId = parseInt(req.params.id);
        const members = await Chatroom.getMembers(chatroomId);
        res.json({ success: true, members });
    } catch (error) {
        res.status(500).json({ success: false, message: '获取成员列表失败' });
    }
});

/**
 * Socket.IO 连接处理
 */

// 暂时禁用Socket认证中间件，改为在连接时验证
// io.use(requireAuthSocket);

io.on('connection', async (socket) => {
    log(`新连接: ${socket.id}`);
    
    // 暂时允许所有连接，但需要在前端传递用户信息
    // 在实际应用中，这里应该验证用户身份
    socket.user = null;
    
    // 等待前端发送用户信息
    socket.on('authenticate', async (userData) => {
        try {
            // 验证用户信息
            const user = await User.findById(userData.id);
            if (!user) {
                socket.emit('error', { message: '用户不存在' });
                return;
            }
            
            socket.user = {
                id: user.id,
                nickname: user.nickname,
                username: user.username,
                email: user.email,
                avatar: user.avatar
            };
            
            log(`用户 ${socket.user.nickname} 认证成功: ${socket.id}`);
            onlineUsers.set(socket.id, socket.user);
            socket.emit('authenticated', { success: true });
        } catch (error) {
            console.error('用户认证错误:', error);
            socket.emit('error', { message: '认证失败' });
        }
    });

    /**
     * 加入聊天室
     */
    socket.on('joinRoom', async (data) => {
        try {
            if (!socket.user) {
                socket.emit('error', { message: '请先登录' });
                return;
            }
            
            const { chatroomId } = data;
            const user = socket.user; // 从socket对象获取用户信息
            
            // 验证聊天室是否存在
            const chatroom = await Chatroom.findById(chatroomId);
            if (!chatroom) {
                socket.emit('error', { message: '聊天室不存在' });
                return;
            }

            // 确保用户是聊天室成员
            await Chatroom.addMember(chatroomId, user.id);

            // 加入Socket.IO房间
            socket.join(`room_${chatroomId}`);

            // 存储用户在聊天室中的信息
            if (!chatroomUsers.has(chatroomId)) {
                chatroomUsers.set(chatroomId, new Set());
            }
            chatroomUsers.get(chatroomId).add(socket.id);

            // 获取聊天室历史消息
            const messages = await Message.getByChatroom(chatroomId, 50);
            log(`发送历史消息给用户 ${user.nickname}，聊天室 ${chatroomId}，消息数量: ${messages.length}`);
            socket.emit('messageHistory', messages);

            // 获取聊天室成员列表
            const members = await Chatroom.getMembers(chatroomId);
            socket.emit('roomMembers', members);

            // 通知聊天室其他用户
            socket.to(`room_${chatroomId}`).emit('userJoined', {
                user: {
                    id: user.id,
                    nickname: user.nickname,
                    username: user.username
                },
                message: `${user.nickname} 加入了聊天室`
            });

            log(`${user.nickname} 加入了聊天室 ${chatroomId}`);
        } catch (error) {
            console.error('加入聊天室错误:', error);
            socket.emit('error', { message: '加入聊天室失败' });
        }
    });

    /**
     * 发送消息
     */
    socket.on('message', async (data) => {
        try {
            if (!socket.user) {
                socket.emit('error', { message: '请先登录' });
                return;
            }
            
            const { chatroomId, content } = data;
            const user = socket.user; // 从socket对象获取用户信息
            
            if (!content || content.trim().length === 0) {
                return;
            }

            // 保存消息到数据库
            const message = await Message.create({
                chatroom_id: chatroomId,
                user_id: user.id,
                content: content.trim()
            });

            const messageData = {
                id: message.id,
                userId: user.id,
                nickname: user.nickname,
                username: user.username,
                avatar: user.avatar,
                content: content.trim(),
                timestamp: new Date().toLocaleTimeString('zh-CN'),
                chatroomId: chatroomId
            };

            // 广播消息给聊天室所有用户
            io.to(`room_${chatroomId}`).emit('message', messageData);
            
            log(`[房间${chatroomId}] ${user.nickname}: ${content}`);
        } catch (error) {
            console.error('发送消息错误:', error);
            socket.emit('error', { message: '发送消息失败' });
        }
    });

    /**
     * 处理用户正在输入状态
     */
    socket.on('typing', (data) => {
        if (!socket.user) return;
        
        const { chatroomId, isTyping } = data;
        const user = socket.user; // 从socket对象获取用户信息
        
        // 管理正在输入的用户列表
        if (!typingUsers.has(chatroomId)) {
            typingUsers.set(chatroomId, new Map());
        }
        
        const roomTypingUsers = typingUsers.get(chatroomId);
        
        if (isTyping) {
            roomTypingUsers.set(socket.id, {
                id: user.id,
                nickname: user.nickname
            });
        } else {
            roomTypingUsers.delete(socket.id);
        }
        
        // 发送正在输入的用户列表给聊天室所有用户
        const typingList = Array.from(roomTypingUsers.values());
        io.to(`room_${chatroomId}`).emit('typingUsers', {
            chatroomId: chatroomId,
            typingUsers: typingList
        });
    });

    /**
     * 离开聊天室
     */
    socket.on('leaveRoom', (data) => {
        if (!socket.user) return;
        
        const { chatroomId } = data;
        const user = socket.user; // 从socket对象获取用户信息
        socket.leave(`room_${chatroomId}`);
        
        if (chatroomUsers.has(chatroomId)) {
            chatroomUsers.get(chatroomId).delete(socket.id);
        }

        socket.to(`room_${chatroomId}`).emit('userLeft', {
            user: {
                id: user.id,
                nickname: user.nickname
            },
            message: `${user.nickname} 离开了聊天室`
        });

        log(`${user.nickname} 离开了聊天室 ${chatroomId}`);
    });

    /**
     * 断开连接
     */
    socket.on('disconnect', () => {
        const user = socket.user; // 从socket对象获取用户信息
        if (user) {
            log(`用户 ${user.nickname} 断开连接: ${socket.id}`);
            
            // 从所有聊天室中移除
            for (const [chatroomId, socketIds] of chatroomUsers.entries()) {
                if (socketIds.has(socket.id)) {
                    socketIds.delete(socket.id);
                    
                    // 从正在输入的用户列表中移除
                    if (typingUsers.has(chatroomId)) {
                        typingUsers.get(chatroomId).delete(socket.id);
                        const typingList = Array.from(typingUsers.get(chatroomId).values());
                        socket.to(`room_${chatroomId}`).emit('typingUsers', {
                            chatroomId: chatroomId,
                            typingUsers: typingList
                        });
                    }
                    
                    socket.to(`room_${chatroomId}`).emit('userLeft', {
                        user: {
                            id: user.id,
                            nickname: user.nickname
                        },
                        message: `${user.nickname} 离开了聊天室`
                    });
                }
            }
        } else {
            log(`未认证用户断开连接: ${socket.id}`);
        }

        // 从在线用户中移除
        onlineUsers.delete(socket.id);
    });
});

/**
 * 启动服务器
 */
async function startServer() {
    try {
        // 初始化数据库
        await initializeDatabase();
        log('数据库初始化完成');

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, '0.0.0.0', () => {
            log(`聊天室服务器运行在 http://0.0.0.0:${PORT}`);
        });
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();