import jwt from 'jsonwebtoken';

// Token generation with proper types
const generateTokens = (userId: string, role: string) => {
    const accessToken = jwt.sign(
        { userId, role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
        { userId, role, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
        { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
};

export default generateTokens;