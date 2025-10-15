/**
 * 用户认证中间件
 * 处理用户注册、登录和会话管理
 */

const bcrypt = require('bcryptjs');
const { User } = require('./database');

/**
 * 密码加密
 * @param {string} password - 原始密码
 * @returns {Promise<string>} 加密后的密码
 */
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * 验证密码
 * @param {string} password - 原始密码
 * @param {string} hashedPassword - 加密后的密码
 * @returns {Promise<boolean>} 验证结果
 */
async function verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
}

/**
 * 生成默认头像
 * @param {string} nickname - 用户昵称
 * @returns {string} 头像URL
 */
function generateDefaultAvatar(nickname) {
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
 * 用户注册
 * @param {Object} userData - 用户注册数据
 * @returns {Promise<Object>} 注册结果
 */
async function registerUser(userData) {
    const { username, password, nickname, email } = userData;

    // 检查用户名是否已存在
    const existingUser = await User.findByUsername(username);
    if (existingUser) {
        throw new Error('用户名已存在');
    }

    // 验证输入数据
    if (!username || !password || !nickname) {
        throw new Error('用户名、密码和昵称不能为空');
    }

    if (username.length < 3 || username.length > 20) {
        throw new Error('用户名长度必须在3-20个字符之间');
    }

    if (password.length < 6) {
        throw new Error('密码长度不能少于6个字符');
    }

    if (nickname.length < 2 || nickname.length > 20) {
        throw new Error('昵称长度必须在2-20个字符之间');
    }

    // 加密密码
    const hashedPassword = await hashPassword(password);

    // 生成默认头像
    const defaultAvatar = generateDefaultAvatar(nickname);

    // 创建用户
    const newUser = await User.create({
        username,
        password: hashedPassword,
        nickname,
        email: email || null,
        avatar: defaultAvatar
    });

    return {
        success: true,
        user: {
            id: newUser.id,
            username: newUser.username,
            nickname: newUser.nickname,
            email: newUser.email,
            avatar: newUser.avatar
        }
    };
}

/**
 * 用户登录
 * @param {Object} loginData - 登录数据
 * @returns {Promise<Object>} 登录结果
 */
async function loginUser(loginData) {
    const { username, password } = loginData;

    if (!username || !password) {
        throw new Error('用户名和密码不能为空');
    }

    // 查找用户
    const user = await User.findByUsername(username);
    if (!user) {
        throw new Error('用户名或密码错误');
    }

    // 验证密码
    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
        throw new Error('用户名或密码错误');
    }

    // 更新最后登录时间
    await User.updateLastLogin(user.id);

    return {
        success: true,
        user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            email: user.email,
            avatar: user.avatar
        }
    };
}

/**
 * 验证用户会话
 * @param {Object} session - 会话对象
 * @returns {Promise<Object|null>} 用户信息或null
 */
async function verifySession(session) {
    if (!session || !session.userId) {
        return null;
    }

    const user = await User.findById(session.userId);
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email
    };
}

/**
 * 中间件：检查用户是否已登录
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 */
async function requireAuth(req, res, next) {
    try {
        const user = await verifySession(req.session);
        if (!user) {
            return res.status(401).json({ success: false, message: '请先登录' });
        }
        req.user = user;
        next();
    } catch (error) {
        console.error('认证中间件错误:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
}

/**
 * 中间件：检查用户是否已登录（用于Socket.IO）
 * @param {Object} socket - Socket对象
 * @param {Function} next - 下一个中间件
 */
async function requireAuthSocket(socket, next) {
    try {
        const user = await verifySession(socket.request.session);
        if (!user) {
            return next(new Error('请先登录'));
        }
        socket.user = user;
        next();
    } catch (error) {
        console.error('Socket认证错误:', error);
        next(new Error('认证失败'));
    }
}

module.exports = {
    registerUser,
    loginUser,
    verifySession,
    requireAuth,
    requireAuthSocket
};
