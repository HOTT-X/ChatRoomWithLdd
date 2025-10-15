/**
 * 数据库配置文件
 * 使用MySQL数据库
 */

const mysql = require('mysql2/promise');

// 数据库配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '533533',
    database: 'chatroom_db',
    charset: 'utf8mb4'
};

// 创建数据库连接池
const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/**
 * 初始化数据库表结构
 */
async function initializeDatabase() {
    try {
        // 创建数据库（如果不存在）
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password
        });
        
        await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.end();

        // 创建用户表
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                nickname VARCHAR(50) NOT NULL,
                email VARCHAR(100),
                avatar VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL
            )
        `);

        // 创建聊天室表
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS chatrooms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_public BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 创建聊天室成员表
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS chatroom_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chatroom_id INT NOT NULL,
                user_id INT NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_member (chatroom_id, user_id)
            )
        `);

        // 创建用户聊天室置顶表
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS user_pinned_chatrooms (
                user_id INT NOT NULL,
                chatroom_id INT NOT NULL,
                pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, chatroom_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id) ON DELETE CASCADE
            )
        `);

        // 创建消息表
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chatroom_id INT NOT NULL,
                user_id INT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('数据库初始化完成');
    } catch (error) {
        console.error('数据库初始化失败:', error);
        throw error;
    }
}

/**
 * 用户相关数据库操作
 */
const User = {
    /**
     * 创建新用户
     * @param {Object} userData - 用户数据
     * @returns {Promise<Object>} 创建的用户信息
     */
    async create(userData) {
        const { username, password, nickname, email, avatar } = userData;
        const [result] = await pool.execute(
            'INSERT INTO users (username, password, nickname, email, avatar) VALUES (?, ?, ?, ?, ?)',
            [username, password, nickname, email, avatar]
        );
        return { id: result.insertId, username, nickname, email, avatar };
    },

    /**
     * 根据用户名查找用户
     * @param {string} username - 用户名
     * @returns {Promise<Object|null>} 用户信息
     */
    async findByUsername(username) {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        return rows[0] || null;
    },

    /**
     * 根据ID查找用户
     * @param {number} id - 用户ID
     * @returns {Promise<Object|null>} 用户信息
     */
    async findById(id) {
        const [rows] = await pool.execute(
            'SELECT id, username, nickname, email, avatar, created_at, last_login FROM users WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    },

    /**
     * 更新用户最后登录时间
     * @param {number} id - 用户ID
     */
    async updateLastLogin(id) {
        await pool.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );
    },

    /**
     * 更新用户头像
     * @param {number} id - 用户ID
     * @param {string} avatar - 头像URL
     */
    async updateAvatar(id, avatar) {
        await pool.execute(
            'UPDATE users SET avatar = ? WHERE id = ?',
            [avatar, id]
        );
    }
};

/**
 * 聊天室相关数据库操作
 */
const Chatroom = {
    /**
     * 创建新聊天室
     * @param {Object} roomData - 聊天室数据
     * @returns {Promise<Object>} 创建的聊天室信息
     */
    async create(roomData) {
        const { name, description, created_by, is_public = true } = roomData;
        const [result] = await pool.execute(
            'INSERT INTO chatrooms (name, description, created_by, is_public) VALUES (?, ?, ?, ?)',
            [name, description, created_by, is_public]
        );
        return { id: result.insertId, name, description, created_by, is_public };
    },

    /**
     * 获取所有公开聊天室
     * @returns {Promise<Array>} 聊天室列表
     */
    async getAllPublic(userId = null) {
        let query = `
            SELECT c.*, 
                   u.nickname as creator_name, 
                   COUNT(cm.user_id) as member_count,
                   last_msg.user_id as last_reply_user_id,
                   last_msg.nickname as last_reply_user_name,
                   last_msg.created_at as last_reply_time`;
        
        if (userId) {
            query += `, 
                   CASE WHEN pc.chatroom_id IS NOT NULL THEN 1 ELSE 0 END as is_pinned,
                   pc.pinned_at`;
        }
        
        query += `
            FROM chatrooms c
            LEFT JOIN users u ON c.created_by = u.id
            LEFT JOIN chatroom_members cm ON c.id = cm.chatroom_id`;
        
        if (userId) {
            query += `
            LEFT JOIN user_pinned_chatrooms pc ON c.id = pc.chatroom_id AND pc.user_id = ?`;
        }
        
        query += `
            LEFT JOIN (
                SELECT m.chatroom_id, m.user_id, u.nickname, m.created_at,
                       ROW_NUMBER() OVER (PARTITION BY m.chatroom_id ORDER BY m.created_at DESC) as rn
                FROM messages m
                JOIN users u ON m.user_id = u.id
            ) last_msg ON c.id = last_msg.chatroom_id AND last_msg.rn = 1
            WHERE c.is_public = TRUE
            GROUP BY c.id, last_msg.user_id, last_msg.nickname, last_msg.created_at`;
        
        if (userId) {
            query += `, pc.chatroom_id, pc.pinned_at`;
        }
        
        query += `
            ORDER BY `;
        
        if (userId) {
            query += `is_pinned DESC, `;
        }
        
        query += `COALESCE(last_msg.created_at, c.created_at) DESC`;

        const params = userId ? [userId] : [];
        const [rows] = await pool.execute(query, params);
        return rows;
    },

    /**
     * 根据ID获取聊天室信息
     * @param {number} id - 聊天室ID
     * @returns {Promise<Object|null>} 聊天室信息
     */
    async findById(id) {
        const [rows] = await pool.execute(
            'SELECT * FROM chatrooms WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    },

    /**
     * 添加用户到聊天室
     * @param {number} chatroomId - 聊天室ID
     * @param {number} userId - 用户ID
     */
    async addMember(chatroomId, userId) {
        await pool.execute(
            'INSERT IGNORE INTO chatroom_members (chatroom_id, user_id) VALUES (?, ?)',
            [chatroomId, userId]
        );
    },

    /**
     * 从聊天室移除用户
     * @param {number} chatroomId - 聊天室ID
     * @param {number} userId - 用户ID
     */
    async removeMember(chatroomId, userId) {
        await pool.execute(
            'DELETE FROM chatroom_members WHERE chatroom_id = ? AND user_id = ?',
            [chatroomId, userId]
        );
    },

    /**
     * 获取聊天室成员列表
     * @param {number} chatroomId - 聊天室ID
     * @returns {Promise<Array>} 成员列表
     */
    async getMembers(chatroomId) {
        const [rows] = await pool.execute(`
            SELECT u.id, u.username, u.nickname, cm.joined_at
            FROM chatroom_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.chatroom_id = ?
            ORDER BY cm.joined_at ASC
        `, [chatroomId]);
        return rows;
    },

    /**
     * 置顶聊天室
     * @param {number} userId - 用户ID
     * @param {number} chatroomId - 聊天室ID
     * @returns {Promise<boolean>} 是否成功
     */
    async pinChatroom(userId, chatroomId) {
        try {
            await pool.execute(
                'INSERT IGNORE INTO user_pinned_chatrooms (user_id, chatroom_id) VALUES (?, ?)',
                [userId, chatroomId]
            );
            return true;
        } catch (error) {
            console.error('置顶聊天室失败:', error);
            return false;
        }
    },

    /**
     * 取消置顶聊天室
     * @param {number} userId - 用户ID
     * @param {number} chatroomId - 聊天室ID
     * @returns {Promise<boolean>} 是否成功
     */
    async unpinChatroom(userId, chatroomId) {
        try {
            await pool.execute(
                'DELETE FROM user_pinned_chatrooms WHERE user_id = ? AND chatroom_id = ?',
                [userId, chatroomId]
            );
            return true;
        } catch (error) {
            console.error('取消置顶聊天室失败:', error);
            return false;
        }
    },

    /**
     * 获取用户置顶的聊天室列表
     * @param {number} userId - 用户ID
     * @returns {Promise<Array>} 置顶聊天室ID列表
     */
    async getPinnedChatrooms(userId) {
        const [rows] = await pool.execute(
            'SELECT chatroom_id FROM user_pinned_chatrooms WHERE user_id = ? ORDER BY pinned_at DESC',
            [userId]
        );
        return rows.map(row => row.chatroom_id);
    }
};

/**
 * 消息相关数据库操作
 */
const Message = {
    /**
     * 保存消息
     * @param {Object} messageData - 消息数据
     * @returns {Promise<Object>} 保存的消息信息
     */
    async create(messageData) {
        const { chatroom_id, user_id, content } = messageData;
        const [result] = await pool.execute(
            'INSERT INTO messages (chatroom_id, user_id, content) VALUES (?, ?, ?)',
            [chatroom_id, user_id, content]
        );
        return { id: result.insertId, chatroom_id, user_id, content };
    },

    /**
     * 获取聊天室的历史消息
     * @param {number} chatroomId - 聊天室ID
     * @param {number} limit - 限制数量
     * @returns {Promise<Array>} 消息列表
     */
    async getByChatroom(chatroomId, limit = 100) {
        // 确保limit是数字，防止SQL注入
        const safeLimit = parseInt(limit) || 100;
        const [rows] = await pool.execute(`
            SELECT m.*, u.nickname, u.username, u.avatar
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.chatroom_id = ?
            ORDER BY m.created_at DESC
            LIMIT ${safeLimit}
        `, [chatroomId]);
        return rows.reverse(); // 按时间正序返回
    }
};

module.exports = {
    pool,
    initializeDatabase,
    User,
    Chatroom,
    Message
};
