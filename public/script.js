/**
 * 多用户聊天室前端JavaScript
 * 处理用户界面交互和WebSocket通信
 */

class ChatRoom {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.isTyping = false;
        this.typingTimeout = null;
        this.unreadCounts = new Map(); // 存储每个聊天室的未读消息数
        this.lastReadTimes = new Map(); // 存储每个聊天室的最后阅读时间
        this.currentSort = 'last_reply'; // 当前排序方式
        this.sortOrder = 'desc'; // 排序顺序：asc 或 desc
        this.cachedChatrooms = []; // 缓存的聊天室数据
        
        this.initializeElements();
        this.bindEvents();
        this.checkAuthStatus();
    }

    /**
     * 初始化DOM元素引用
     */
    initializeElements() {
        // 认证相关元素
        this.authModal = document.getElementById('authModal');
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        this.loginFormElement = document.getElementById('loginFormElement');
        this.registerFormElement = document.getElementById('registerFormElement');
        
        // 聊天室列表相关元素
        this.chatroomList = document.getElementById('chatroomList');
        this.currentUserSpan = document.getElementById('currentUser');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
        this.roomsContainer = document.getElementById('roomsContainer');
        this.sortSelect = document.getElementById('sortSelect');
        this.sortOrderBtn = document.getElementById('sortOrderBtn');
        
        // 聊天界面相关元素
        this.chatContainer = document.getElementById('chatContainer');
        this.backToListBtn = document.getElementById('backToListBtn');
        this.currentRoomName = document.getElementById('currentRoomName');
        this.roomMemberCount = document.getElementById('roomMemberCount');
        this.leaveRoomBtn = document.getElementById('leaveRoomBtn');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.typingText = document.getElementById('typingText');
        
        // 创建聊天室模态框
        this.createRoomModal = document.getElementById('createRoomModal');
        this.createRoomForm = document.getElementById('createRoomForm');
        this.cancelCreateRoom = document.getElementById('cancelCreateRoom');
        
        // 头像设置相关元素
        this.avatarModal = document.getElementById('avatarModal');
        this.avatarSettingsBtn = document.getElementById('avatarSettingsBtn');
        this.userAvatar = document.getElementById('userAvatar');
        this.currentAvatarPreview = document.getElementById('currentAvatarPreview');
        this.newAvatarPreview = document.getElementById('newAvatarPreview');
        this.closeAvatarModal = document.getElementById('closeAvatarModal');
        this.saveAvatarBtn = document.getElementById('saveAvatarBtn');
        this.cancelAvatarBtn = document.getElementById('cancelAvatarBtn');
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 认证标签切换
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchAuthTab(e.target.dataset.tab);
            });
        });

        // 登录表单提交
        this.loginFormElement.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // 注册表单提交
        this.registerFormElement.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // 登出按钮
        this.logoutBtn.addEventListener('click', () => {
            this.handleLogout();
        });

        // 创建聊天室按钮
        this.createRoomBtn.addEventListener('click', () => {
            this.showCreateRoomModal();
        });

        // 刷新聊天室列表
        this.refreshRoomsBtn.addEventListener('click', () => {
            this.refreshChatrooms();
        });

        // 排序选择
        this.sortSelect.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            console.log('排序方式改变为:', this.currentSort);
            this.applySorting();
        });

        // 排序顺序切换
        this.sortOrderBtn.addEventListener('click', () => {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
            this.sortOrderBtn.textContent = this.sortOrder === 'asc' ? '↑' : '↓';
            this.sortOrderBtn.classList.toggle('desc', this.sortOrder === 'desc');
            console.log('排序顺序改变为:', this.sortOrder);
            this.applySorting();
        });

        // 创建聊天室表单
        this.createRoomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateRoom();
        });

        // 取消创建聊天室
        this.cancelCreateRoom.addEventListener('click', () => {
            this.hideCreateRoomModal();
        });

        // 头像设置相关事件
        this.avatarSettingsBtn.addEventListener('click', () => {
            this.showAvatarModal();
        });

        this.closeAvatarModal.addEventListener('click', () => {
            this.hideAvatarModal();
        });

        this.cancelAvatarBtn.addEventListener('click', () => {
            this.hideAvatarModal();
        });

        this.saveAvatarBtn.addEventListener('click', () => {
            this.saveAvatar();
        });

        // 返回聊天室列表
        this.backToListBtn.addEventListener('click', () => {
            this.showChatroomList();
        });

        // 离开聊天室
        this.leaveRoomBtn.addEventListener('click', () => {
            this.leaveCurrentRoom();
        });

        // 发送消息
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // 回车发送消息
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // 输入状态检测
        this.messageInput.addEventListener('input', () => {
            this.handleTyping();
        });
    }

    /**
     * 检查用户认证状态
     */
    async checkAuthStatus() {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.showChatroomList();
                this.loadChatrooms();
                this.initializeSocket();
            } else {
                this.showAuthModal();
            }
        } catch (error) {
            console.error('检查认证状态失败:', error);
            this.showAuthModal();
        }
    }

    /**
     * 初始化Socket.IO连接
     */
    initializeSocket() {
        this.socket = io();

        // 连接成功
        this.socket.on('connect', () => {
            console.log('已连接到服务器');
            // 发送用户认证信息
            if (this.currentUser) {
                this.socket.emit('authenticate', { id: this.currentUser.id });
            }
        });

        // 认证成功
        this.socket.on('authenticated', async (data) => {
            console.log('Socket认证成功');
            // 重新获取用户信息以确保头像是最新的
            await this.refreshUserInfo();
        });

        // 接收消息
        this.socket.on('message', (data) => {
            console.log('收到消息:', data);
            
            if (this.currentRoom && data.chatroomId === this.currentRoom.id) {
                console.log('消息在当前房间，直接显示');
                this.displayMessage(data);
            } else {
                console.log('消息不在当前房间，忽略');
            }
        });

        // 用户加入
        this.socket.on('userJoined', (data) => {
            if (this.currentRoom && data.user.id !== this.currentUser.id) {
                this.displaySystemMessage(data.message);
            }
        });

        // 用户离开
        this.socket.on('userLeft', (data) => {
            if (this.currentRoom && data.user.id !== this.currentUser.id) {
                this.displaySystemMessage(data.message);
            }
        });

        // 用户正在输入
        this.socket.on('userTyping', (data) => {
            if (this.currentRoom && data.user.id !== this.currentUser.id) {
                this.showTypingIndicator(data);
            }
        });

        // 接收消息历史
        this.socket.on('messageHistory', (history) => {
            console.log('收到消息历史事件:', history);
            this.displayMessageHistory(history);
        });

        // 接收聊天室成员列表
        this.socket.on('roomMembers', (members) => {
            this.updateRoomMemberCount(members.length);
        });

        // 接收正在输入的用户列表
        this.socket.on('typingUsers', (data) => {
            if (this.currentRoom && data.chatroomId === this.currentRoom.id) {
                this.updateTypingUsers(data.typingUsers);
            }
        });

        // 错误处理
        this.socket.on('error', (error) => {
            console.error('Socket错误:', error);
            alert(error.message || '连接出现错误');
        });
    }

    /**
     * 切换认证标签
     */
    switchAuthTab(tab) {
        // 更新标签按钮状态
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // 显示对应表单
        this.loginForm.classList.toggle('active', tab === 'login');
        this.registerForm.classList.toggle('active', tab === 'register');
    }

    /**
     * 处理用户登录
     */
    async handleLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            alert('请输入用户名和密码');
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (data.success) {
                this.currentUser = data.user;
                this.showChatroomList();
                this.loadChatrooms();
                this.initializeSocket();
            } else {
                alert(data.message || '登录失败');
            }
        } catch (error) {
            console.error('登录错误:', error);
            alert('登录失败，请重试');
        }
    }

    /**
     * 处理用户注册
     */
    async handleRegister() {
        const username = document.getElementById('registerUsername').value.trim();
        const nickname = document.getElementById('registerNickname').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;

        if (!username || !nickname || !password) {
            alert('请填写必填字段');
            return;
        }

        if (password !== confirmPassword) {
            alert('两次输入的密码不一致');
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, nickname, email, password })
            });

            const data = await response.json();
            if (data.success) {
                alert('注册成功，请登录');
                this.switchAuthTab('login');
                // 清空注册表单
                this.registerFormElement.reset();
            } else {
                alert(data.message || '注册失败');
            }
        } catch (error) {
            console.error('注册错误:', error);
            alert('注册失败，请重试');
        }
    }

    /**
     * 处理用户登出
     */
    async handleLogout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            this.currentUser = null;
            this.currentRoom = null;
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.showAuthModal();
        } catch (error) {
            console.error('登出错误:', error);
        }
    }

    /**
     * 显示认证模态框
     */
    showAuthModal() {
        this.authModal.style.display = 'flex';
        this.chatroomList.style.display = 'none';
        this.chatContainer.style.display = 'none';
    }

    /**
     * 显示聊天室列表
     */
    showChatroomList() {
        this.authModal.style.display = 'none';
        this.chatroomList.style.display = 'flex';
        this.chatContainer.style.display = 'none';
        this.currentUserSpan.textContent = this.currentUser.nickname;
        
        // 如果当前在聊天室中，先离开聊天室
        if (this.currentRoom) {
            console.log('离开当前聊天室:', this.currentRoom.id);
            this.socket.emit('leaveRoom', { chatroomId: this.currentRoom.id });
            this.currentRoom = null;
        }
        console.log('返回聊天室列表，清理当前房间状态');
        
        // 更新用户头像显示
        if (this.currentUser.avatar) {
            this.userAvatar.src = this.currentUser.avatar;
        } else {
            this.userAvatar.src = this.generateDefaultAvatar(this.currentUser.nickname);
        }
        
        // 如果聊天室列表已经存在，不需要重新加载
        if (this.roomsContainer.children.length === 0) {
            this.loadChatrooms();
        }
    }

    /**
     * 显示聊天界面
     */
    showChatInterface() {
        this.chatroomList.style.display = 'none';
        this.chatContainer.style.display = 'flex';
    }

    /**
     * 加载聊天室列表
     */
    async loadChatrooms() {
        try {
            const response = await fetch('/api/chatrooms');
            const data = await response.json();
            
            if (data.success) {
                // 缓存聊天室数据
                this.cachedChatrooms = data.chatrooms;
                this.displayChatrooms(data.chatrooms);
            } else {
                console.error('加载聊天室失败:', data.message);
            }
        } catch (error) {
            console.error('加载聊天室错误:', error);
        }
    }

    /**
     * 刷新聊天室列表（带动画效果）
     */
    async refreshChatrooms() {
        // 添加加载动画
        this.refreshRoomsBtn.classList.add('loading');
        this.refreshRoomsBtn.disabled = true;
        
        try {
            await this.loadChatrooms();
        } finally {
            // 移除加载动画
            setTimeout(() => {
                this.refreshRoomsBtn.classList.remove('loading');
                this.refreshRoomsBtn.disabled = false;
            }, 500);
        }
    }

    /**
     * 排序聊天室
     * @param {Array} chatrooms - 聊天室数组
     * @returns {Array} 排序后的聊天室数组
     */
    sortChatrooms(chatrooms) {
        console.log('开始排序聊天室:', {
            sortType: this.currentSort,
            sortOrder: this.sortOrder,
            chatroomCount: chatrooms.length
        });
        
        return chatrooms.sort((a, b) => {
            // 首先按置顶状态排序（置顶的在前）
            const pinnedA = a.is_pinned === 1 ? 1 : 0;
            const pinnedB = b.is_pinned === 1 ? 1 : 0;
            
            console.log(`比较 ${a.name} (置顶:${pinnedA}) vs ${b.name} (置顶:${pinnedB})`);
            
            if (pinnedA !== pinnedB) {
                console.log(`置顶状态不同，${pinnedA > pinnedB ? a.name : b.name} 排在前面`);
                return pinnedB - pinnedA; // 置顶的在前
            }
            
            // 然后按未读消息数排序（未读多的在前）
            const unreadA = this.unreadCounts.get(a.id) || 0;
            const unreadB = this.unreadCounts.get(b.id) || 0;
            
            if (unreadA !== unreadB) {
                return unreadB - unreadA;
            }
            
            // 再按选择的排序方式排序
            let comparison = 0;
            
            switch (this.currentSort) {
                case 'last_reply':
                    const timeA = new Date(a.last_reply_time || a.created_at);
                    const timeB = new Date(b.last_reply_time || b.created_at);
                    comparison = timeA - timeB;
                    break;
                case 'creation':
                    comparison = new Date(a.created_at) - new Date(b.created_at);
                    break;
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'online':
                    comparison = (a.online_count || 0) - (b.online_count || 0);
                    break;
            }
            
            const result = this.sortOrder === 'asc' ? comparison : -comparison;
            console.log(`比较 ${a.name} vs ${b.name}:`, {
                unreadA, unreadB, comparison, result
            });
            
            return result;
        });
    }

    /**
     * 应用排序
     */
    applySorting() {
        // 如果有缓存的聊天室数据，直接使用
        if (this.cachedChatrooms && this.cachedChatrooms.length > 0) {
            console.log('使用缓存的聊天室数据进行排序');
            this.displayChatrooms(this.cachedChatrooms);
            return;
        }
        
        // 否则重新加载数据
        console.log('重新加载聊天室数据进行排序');
        this.loadChatrooms();
    }

    /**
     * 显示聊天室列表
     */
    displayChatrooms(chatrooms) {
        this.renderChatrooms(chatrooms);
    }
    
    renderChatrooms(chatrooms) {
        this.roomsContainer.innerHTML = '';
        
        if (chatrooms.length === 0) {
            this.roomsContainer.innerHTML = '<div class="no-rooms">暂无聊天室，点击"创建聊天室"开始吧！</div>';
            return;
        }

        // 应用排序
        const sortedRooms = this.sortChatrooms(chatrooms);
        
        // 调试信息：显示置顶状态
        console.log('聊天室置顶状态:', sortedRooms.map(room => ({
            id: room.id,
            name: room.name,
            is_pinned: room.is_pinned
        })));

        sortedRooms.forEach(room => {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            
            // 格式化最后回复时间和创建时间
            const lastReplyTime = room.last_reply_time ? this.formatLastReplyTime(room.last_reply_time) : '';
            const lastReplyUser = room.last_reply_user_name || '';
            const creationTime = room.created_at ? this.formatCreationTime(room.created_at) : '';
            
            const isPinned = room.is_pinned === 1;
            if (isPinned) {
                roomElement.setAttribute('data-pinned', 'true');
            }
            roomElement.innerHTML = `
                <div class="room-header">
                    <div class="room-name-container">
                        <div class="room-name">${this.escapeHtml(room.name)}</div>
                        ${isPinned ? '<span class="pinned-indicator" title="已置顶">📌</span>' : ''}
                    </div>
                    <div class="room-actions">
                        <button class="pin-btn" data-room-id="${room.id}" title="${isPinned ? '取消置顶' : '置顶'}">
                            ${isPinned ? '📌' : '📍'}
                        </button>
                        <div class="room-members">
                            <span class="online-indicator"></span>
                            ${room.online_count || 0} 人在线
                        </div>
                    </div>
                </div>
                <div class="room-description">${this.escapeHtml(room.description || '暂无描述')}</div>
                <div class="room-info">
                    <div class="room-creator">
                        创建者: ${this.escapeHtml(room.creator_name)} ${creationTime ? `· ${creationTime}` : ''}
                    </div>
                    ${lastReplyUser ? `
                        <div class="room-last-reply">
                            最后回复: ${this.escapeHtml(lastReplyUser)} ${lastReplyTime ? `· ${lastReplyTime}` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
            
            roomElement.addEventListener('click', (e) => {
                // 如果点击的是置顶按钮，不触发加入聊天室
                if (e.target.classList.contains('pin-btn')) {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('置顶按钮被点击:', e.target);
                    this.togglePin(room.id, e.target);
                    return;
                }
                this.joinChatroom(room);
            });
            
            this.roomsContainer.appendChild(roomElement);
        });
    }

    /**
     * 增加未读消息计数
     * @param {number} chatroomId - 聊天室ID
     */
    incrementUnreadCount(chatroomId) {
        const currentCount = this.unreadCounts.get(chatroomId) || 0;
        this.unreadCounts.set(chatroomId, currentCount + 1);
        console.log(`📨 未读消息+1: 聊天室${chatroomId}, 总计: ${currentCount + 1}`);
        this.updateChatroomItem(chatroomId); // 只更新特定的聊天室项
    }

    /**
     * 清除未读消息计数
     * @param {number} chatroomId - 聊天室ID
     */
    clearUnreadCount(chatroomId) {
        this.unreadCounts.set(chatroomId, 0);
        this.lastReadTimes.set(chatroomId, new Date());
        this.updateChatroomItem(chatroomId); // 更新聊天室项显示
    }

    /**
     * 更新特定聊天室项的显示
     * @param {number} chatroomId - 聊天室ID
     */
    updateChatroomItem(chatroomId) {
        const roomElement = document.querySelector(`[data-room-id="${chatroomId}"]`);
        if (!roomElement) {
            console.log(`❌ 未找到聊天室元素: ${chatroomId}`);
            return;
        }

        const unreadCount = this.unreadCounts.get(chatroomId) || 0;
        console.log(`🔄 更新聊天室${chatroomId}显示, 未读计数: ${unreadCount}`);
        
        // 更新未读徽章
        const unreadBadge = roomElement.querySelector('.unread-badge');
        if (unreadCount > 0) {
            if (unreadBadge) {
                unreadBadge.textContent = unreadCount;
            } else {
                const membersDiv = roomElement.querySelector('.room-members');
                if (membersDiv) {
                    // 创建未读徽章元素
                    const badge = document.createElement('span');
                    badge.className = 'unread-badge';
                    badge.textContent = unreadCount;
                    membersDiv.appendChild(badge);
                }
            }
            roomElement.classList.add('has-unread');
        } else {
            if (unreadBadge) {
                unreadBadge.remove();
            }
            roomElement.classList.remove('has-unread');
        }

        // 如果未读消息数量变化较大，重新排序聊天室列表
        // 这里可以添加一个简单的重新排序逻辑
        this.reorderChatrooms();
    }

    /**
     * 重新排序聊天室列表
     */
    reorderChatrooms() {
        // 暂时禁用重新排序，避免破坏未读消息显示
        // 只在必要时重新加载整个列表
        return;
    }

    /**
     * 加入聊天室
     */
    async joinChatroom(room) {
        try {
            console.log('加入聊天室:', room);
            
            // 先加入聊天室
            const response = await fetch(`/api/chatrooms/${room.id}/join`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.currentRoom = room;
                this.currentRoomName.textContent = room.name;
                this.showChatInterface();
                
                // 清空消息容器，但先显示加载提示
                this.messagesContainer.innerHTML = '<div class="welcome-message"><p>正在加载历史消息...</p></div>';
                
                console.log('通过Socket加入房间:', room.id);
                // 通过Socket加入房间
                this.socket.emit('joinRoom', { chatroomId: room.id });
                
                // 聚焦到消息输入框
                this.messageInput.focus();
            } else {
                const data = await response.json();
                console.error('加入聊天室API失败:', data);
                alert(data.message || '加入聊天室失败');
            }
        } catch (error) {
            console.error('加入聊天室错误:', error);
            alert('加入聊天室失败');
        }
    }

    /**
     * 离开当前聊天室
     */
    leaveCurrentRoom() {
        if (this.currentRoom) {
            this.socket.emit('leaveRoom', { chatroomId: this.currentRoom.id });
            this.currentRoom = null;
            this.showChatroomList();
        }
    }

    /**
     * 显示创建聊天室模态框
     */
    showCreateRoomModal() {
        this.createRoomModal.style.display = 'flex';
    }

    /**
     * 隐藏创建聊天室模态框
     */
    hideCreateRoomModal() {
        this.createRoomModal.style.display = 'none';
        this.createRoomForm.reset();
    }

    /**
     * 处理创建聊天室
     */
    async handleCreateRoom() {
        const name = document.getElementById('roomName').value.trim();
        const description = document.getElementById('roomDescription').value.trim();

        if (!name) {
            alert('请输入聊天室名称');
            return;
        }

        try {
            const response = await fetch('/api/chatrooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description })
            });

            const data = await response.json();
            if (data.success) {
                this.hideCreateRoomModal();
                this.loadChatrooms(); // 刷新聊天室列表
                alert('聊天室创建成功！');
            } else {
                alert(data.message || '创建聊天室失败');
            }
        } catch (error) {
            console.error('创建聊天室错误:', error);
            alert('创建聊天室失败');
        }
    }

    /**
     * 发送消息
     */
    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || !this.currentRoom) {
            console.log('发送消息失败:', { message, currentRoom: this.currentRoom });
            return;
        }

        console.log('发送消息:', { 
            chatroomId: this.currentRoom.id, 
            content: message,
            socket: this.socket ? 'connected' : 'disconnected'
        });

        this.socket.emit('message', { 
            chatroomId: this.currentRoom.id, 
            content: message 
        });
        this.messageInput.value = '';
        
        // 停止输入状态
        this.stopTyping();
    }

    /**
     * 显示消息
     * @param {Object} data - 消息数据
     */
    displayMessage(data) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        
        // 判断是否为自己的消息
        // 历史消息使用 user_id，实时消息使用 userId
        const isOwnMessage = this.currentUser && (
            data.userId === this.currentUser.id || 
            data.user_id === this.currentUser.id
        );
        
        if (isOwnMessage) {
            messageElement.classList.add('own');
        }

        // 根据消息长度判断样式
        const content = data.content || '';
        const isLongMessage = content.length > 50 || content.includes('\n');
        const isShortMessage = content.length <= 20 && !content.includes(' ');

        // 获取用户头像
        const userAvatar = data.avatar || this.generateDefaultAvatar(data.nickname);
        
        messageElement.innerHTML = `
            <div class="message-avatar">
                <img src="${userAvatar}" alt="${this.escapeHtml(data.nickname)}" class="avatar-img">
            </div>
            <div class="message-body">
                <div class="message-header">
                    <span class="message-nickname">${this.escapeHtml(data.nickname)}</span>
                    <span class="message-time">${data.timestamp || ''}</span>
                </div>
                <div class="message-content" 
                     data-long="${isLongMessage}" 
                     data-short="${isShortMessage}">${this.escapeHtml(content)}</div>
            </div>
        `;

        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    /**
     * 显示系统消息
     * @param {string} message - 系统消息内容
     */
    displaySystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.textContent = message;
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    /**
     * 显示消息历史
     * @param {Array} history - 消息历史数组
     */
    displayMessageHistory(history) {
        console.log('显示历史消息:', history);
        
        // 清空所有现有内容
        this.messagesContainer.innerHTML = '';

        if (history && history.length > 0) {
            console.log('显示历史消息，数量:', history.length);
            
            // 先显示历史消息
            history.forEach(messageData => {
                // 格式化时间戳
                const formattedMessage = {
                    ...messageData,
                    timestamp: this.formatTimestamp(messageData.created_at)
                };
                this.displayMessage(formattedMessage);
            });
            
            // 在历史消息底部添加分隔线
            console.log('添加历史消息分隔线');
            const separator = document.createElement('div');
            separator.className = 'history-separator';
            separator.innerHTML = '<div class="separator-line"></div><span class="separator-text">以上为历史消息</span><div class="separator-line"></div>';
            this.messagesContainer.appendChild(separator);
        } else {
            console.log('没有历史消息，显示欢迎消息');
            // 如果没有历史消息，显示欢迎消息
            const welcomeMessage = document.createElement('div');
            welcomeMessage.className = 'welcome-message';
            welcomeMessage.innerHTML = '<p>欢迎来到聊天室！开始聊天吧~</p>';
            this.messagesContainer.appendChild(welcomeMessage);
        }

        // 滚动到底部
        this.scrollToBottom();
    }

    /**
     * 更新在线用户数量（保留兼容性）
     * @param {number} count - 在线用户数量
     */
    updateOnlineCount(count) {
        // 这个方法保留用于兼容性，实际功能已由updateRoomMemberCount替代
        console.log('在线用户数量:', count);
    }

    /**
     * 处理用户输入状态
     */
    handleTyping() {
        if (!this.currentRoom) return;
        
        if (!this.isTyping) {
            this.isTyping = true;
            this.socket.emit('typing', { 
                chatroomId: this.currentRoom.id, 
                isTyping: true 
            });
        }

        // 清除之前的定时器
        clearTimeout(this.typingTimeout);
        
        // 设置新的定时器，3秒后停止输入状态
        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 3000);
    }

    /**
     * 停止输入状态
     */
    stopTyping() {
        if (this.isTyping && this.currentRoom) {
            this.isTyping = false;
            this.socket.emit('typing', { 
                chatroomId: this.currentRoom.id, 
                isTyping: false 
            });
        }
        clearTimeout(this.typingTimeout);
    }

    /**
     * 更新聊天室成员数量
     */
    updateRoomMemberCount(count) {
        this.roomMemberCount.textContent = `${count} 人`;
    }

    /**
     * 更新正在输入的用户列表
     */
    updateTypingUsers(typingUsers) {
        const typingIndicator = document.getElementById('typingIndicator');
        const typingText = document.getElementById('typingText');
        
        if (typingUsers.length === 0) {
            typingIndicator.style.display = 'none';
        } else {
            typingIndicator.style.display = 'block';
            
            // 过滤掉当前用户
            const otherTypingUsers = typingUsers.filter(user => user.id !== this.currentUser.id);
            
            if (otherTypingUsers.length === 0) {
                typingIndicator.style.display = 'none';
            } else if (otherTypingUsers.length === 1) {
                typingText.textContent = `${otherTypingUsers[0].nickname} 正在输入...`;
            } else if (otherTypingUsers.length === 2) {
                typingText.textContent = `${otherTypingUsers[0].nickname} 和 ${otherTypingUsers[1].nickname} 正在输入...`;
            } else {
                typingText.textContent = `${otherTypingUsers[0].nickname} 等 ${otherTypingUsers.length} 人正在输入...`;
            }
        }
    }

    /**
     * 显示正在输入提示
     * @param {Object} data - 包含用户昵称和输入状态的数据
     */
    showTypingIndicator(data) {
        if (data.isTyping) {
            this.typingText.textContent = `${data.nickname} 正在输入...`;
            this.typingIndicator.style.display = 'block';
        } else {
            this.typingIndicator.style.display = 'none';
        }
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * 格式化时间戳
     * @param {string|Date} timestamp - 时间戳
     * @returns {string} 格式化后的时间字符串
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === date.toDateString();
        
        if (isToday) {
            return `今天 ${date.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            })}`;
        } else if (isYesterday) {
            return `昨天 ${date.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            })}`;
        } else {
            return date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }
    

    /**
     * 格式化最后回复时间
     * @param {string|Date} timestamp - 时间戳
     * @returns {string} 格式化后的时间字符串
     */
    formatLastReplyTime(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMinutes < 1) {
            return '刚刚';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}分钟前`;
        } else if (diffHours < 24) {
            return `${diffHours}小时前`;
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else {
            return date.toLocaleDateString('zh-CN', {
                month: '2-digit',
                day: '2-digit'
            });
        }
    }

    /**
     * 格式化创建时间
     * @param {string|Date} timestamp - 时间戳
     * @returns {string} 格式化后的时间字符串
     */
    formatCreationTime(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return '今天创建';
        } else if (diffDays === 1) {
            return '昨天创建';
        } else if (diffDays < 7) {
            return `${diffDays}天前创建`;
        } else {
            return date.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        }
    }

    /**
     * 生成默认头像
     * @param {string} nickname - 用户昵称
     * @returns {string} 头像URL
     */
    generateDefaultAvatar(nickname) {
        // 使用DiceBear API生成头像，基于昵称生成固定头像
        const colors = ['4f46e5', '7c3aed', 'dc2626', 'ea580c', '16a34a', '0891b2', 'be185d', '9333ea'];
        const styles = ['avataaars', 'personas', 'micah', 'adventurer'];
        
        // 基于昵称的哈希值选择颜色和样式，确保一致性
        let hash = 0;
        for (let i = 0; i < nickname.length; i++) {
            const char = nickname.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        
        const colorIndex = Math.abs(hash) % colors.length;
        const styleIndex = Math.abs(hash >> 8) % styles.length;
        
        const color = colors[colorIndex];
        const style = styles[styleIndex];
        
        return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(nickname)}&backgroundColor=${color}`;
    }

    /**
     * 显示头像设置弹窗
     */
    showAvatarModal() {
        this.avatarModal.style.display = 'flex';
        
        // 显示当前头像
        if (this.currentUser.avatar) {
            this.currentAvatarPreview.src = this.currentUser.avatar;
        } else {
            this.currentAvatarPreview.src = this.generateDefaultAvatar(this.currentUser.nickname);
        }
        
        // 初始化头像选择器
        this.initializeAvatarSelector();
    }

    /**
     * 隐藏头像设置弹窗
     */
    hideAvatarModal() {
        this.avatarModal.style.display = 'none';
    }

    /**
     * 初始化头像选择器
     */
    initializeAvatarSelector() {
        // 移除之前的事件监听器，避免重复绑定
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
        });
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
        });

        // 绑定风格选择事件
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateAvatarPreview();
            });
        });

        // 绑定颜色选择事件
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateAvatarPreview();
            });
        });

        // 设置默认选择
        document.querySelector('.style-btn').classList.add('active');
        document.querySelector('.color-btn').classList.add('active');
        this.updateAvatarPreview();
    }

    /**
     * 更新头像预览
     */
    updateAvatarPreview() {
        const selectedStyle = document.querySelector('.style-btn.active').dataset.style;
        const selectedColor = document.querySelector('.color-btn.active').dataset.color;
        
        const newAvatarUrl = `https://api.dicebear.com/7.x/${selectedStyle}/svg?seed=${encodeURIComponent(this.currentUser.nickname)}&backgroundColor=${selectedColor}`;
        this.newAvatarPreview.src = newAvatarUrl;
    }

    /**
     * 刷新用户信息
     */
    async refreshUserInfo() {
        try {
            const response = await fetch('/api/user/info', {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.success && data.user) {
                this.currentUser = data.user;
                // 更新界面显示
                if (this.currentUser.avatar) {
                    this.userAvatar.src = this.currentUser.avatar;
                } else {
                    this.userAvatar.src = this.generateDefaultAvatar(this.currentUser.nickname);
                }
                console.log('用户信息已刷新:', this.currentUser);
            }
        } catch (error) {
            console.error('刷新用户信息失败:', error);
        }
    }

    /**
     * 保存头像
     */
    async saveAvatar() {
        try {
            if (!this.currentUser) {
                alert('请先登录');
                return;
            }

            const selectedStyle = document.querySelector('.style-btn.active');
            const selectedColor = document.querySelector('.color-btn.active');
            
            if (!selectedStyle || !selectedColor) {
                alert('请选择头像风格和颜色');
                return;
            }
            
            const newAvatarUrl = `https://api.dicebear.com/7.x/${selectedStyle.dataset.style}/svg?seed=${encodeURIComponent(this.currentUser.nickname)}&backgroundColor=${selectedColor.dataset.color}`;
            
            console.log('正在保存头像:', newAvatarUrl);
            
            const response = await fetch('/api/user/avatar', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // 确保发送cookies
                body: JSON.stringify({ avatar: newAvatarUrl })
            });
            
            const data = await response.json();
            console.log('保存头像响应:', data);
            
            if (data.success) {
                // 更新当前用户头像
                this.currentUser.avatar = newAvatarUrl;
                
                // 更新界面显示
                this.userAvatar.src = newAvatarUrl;
                this.currentAvatarPreview.src = newAvatarUrl;
                
                // 关闭弹窗
                this.hideAvatarModal();
                
                console.log('头像更新成功');
                alert('头像更新成功！');
            } else {
                console.error('头像更新失败:', data.message);
                alert('头像更新失败: ' + data.message);
            }
        } catch (error) {
            console.error('头像更新错误:', error);
            alert('头像更新失败，请重试: ' + error.message);
        }
    }

    /**
     * 切换聊天室置顶状态
     * @param {number} chatroomId - 聊天室ID
     * @param {HTMLElement} button - 置顶按钮元素
     */
    async togglePin(chatroomId, button) {
        try {
            // 更可靠的置顶状态判断
            const isCurrentlyPinned = button.textContent.trim() === '📌';
            const action = isCurrentlyPinned ? 'unpin' : 'pin';
            const method = isCurrentlyPinned ? 'DELETE' : 'POST';
            
            console.log('置顶切换调试:', {
                chatroomId,
                buttonText: button.textContent,
                buttonTextTrimmed: button.textContent.trim(),
                isCurrentlyPinned,
                action,
                method
            });
            
            const response = await fetch(`/api/chatrooms/${chatroomId}/pin`, {
                method: method,
                credentials: 'include'
            });
            
            const data = await response.json();
            
            console.log('API响应:', data);
            
            if (data.success) {
                // 更新按钮状态
                button.textContent = isCurrentlyPinned ? '📍' : '📌';
                button.title = isCurrentlyPinned ? '置顶' : '取消置顶';
                
                // 更新聊天室项的置顶指示器
                const roomElement = button.closest('.room-item');
                const pinnedIndicator = roomElement.querySelector('.pinned-indicator');
                
                if (isCurrentlyPinned) {
                    // 取消置顶
                    roomElement.removeAttribute('data-pinned');
                    if (pinnedIndicator) {
                        pinnedIndicator.remove();
                    }
                } else {
                    // 置顶
                    roomElement.setAttribute('data-pinned', 'true');
                    if (!pinnedIndicator) {
                        const roomNameContainer = roomElement.querySelector('.room-name-container');
                        const indicator = document.createElement('span');
                        indicator.className = 'pinned-indicator';
                        indicator.title = '已置顶';
                        indicator.textContent = '📌';
                        roomNameContainer.appendChild(indicator);
                    }
                }
                
                // 更新缓存数据中的置顶状态
                if (this.cachedChatrooms) {
                    const roomIndex = this.cachedChatrooms.findIndex(room => room.id === chatroomId);
                    if (roomIndex !== -1) {
                        this.cachedChatrooms[roomIndex].is_pinned = isCurrentlyPinned ? 0 : 1;
                    }
                }
                
                // 重新排序并显示聊天室列表
                this.displayChatrooms(this.cachedChatrooms || []);
                
                console.log(`聊天室${chatroomId} ${isCurrentlyPinned ? '取消置顶' : '置顶'}成功`);
            } else {
                console.error('置顶操作失败:', data.message);
                alert('操作失败: ' + data.message);
            }
        } catch (error) {
            console.error('置顶操作错误:', error);
            alert('操作失败，请重试');
        }
    }

    /**
     * HTML转义，防止XSS攻击
     * @param {string} text - 需要转义的文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 页面加载完成后初始化聊天室
document.addEventListener('DOMContentLoaded', () => {
    new ChatRoom();
});
