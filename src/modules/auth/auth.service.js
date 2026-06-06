const bcrypt          = require('bcryptjs');
const jwt             = require('jsonwebtoken');
const prisma          = require('../../config/db');
const { AppError }    = require('../../middleware/errorHandler');

const SALT_ROUNDS = 12;

// ── Token helpers ─────────────────────────────────────────────────────────────

const signAccessToken = (userId, role) =>
  jwt.sign(
    { sub: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const signRefreshToken = (userId) =>
  jwt.sign(
    { sub: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

const buildTokenPair = (user) => ({
  accessToken:  signAccessToken(user.id, user.role),
  refreshToken: signRefreshToken(user.id),
  expiresIn:    process.env.JWT_EXPIRES_IN || '7d',
});

// ── Service methods ───────────────────────────────────────────────────────────

const register = async ({ name, email, password, role }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('Email already registered.', 409);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return { user, tokens: buildTokenPair(user) };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-time comparison even when user doesn't exist (prevents timing attacks)
  const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
  const isValid   = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

  if (!user || !isValid) {
    throw new AppError('Invalid email or password.', 401);
  }
  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Contact an administrator.', 403);
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  return { user: safeUser, tokens: buildTokenPair(user) };
};

const refresh = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid token type.', 401);
  }

  const user = await prisma.user.findUnique({
    where:  { id: decoded.sub },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user)          throw new AppError('User not found.', 401);
  if (!user.isActive) throw new AppError('Account is deactivated.', 403);

  return { tokens: buildTokenPair(user) };
};

const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:        true,
      name:      true,
      email:     true,
      role:      true,
      isActive:  true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { documents: true },
      },
    },
  });

  if (!user) throw new AppError('User not found.', 404);
  return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found.', 404);

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) throw new AppError('Current password is incorrect.', 401);

  if (currentPassword === newPassword) {
    throw new AppError('New password must differ from current password.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data:  { passwordHash },
  });
};

// ── Admin: list all users ─────────────────────────────────────────────────────

const listUsers = async ({ page = 1, limit = 20 } = {}) => {
  const skip  = (page - 1) * limit;
  const where = {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        isActive:  true,
        createdAt: true,
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
};

const toggleUserActive = async (targetUserId, adminId) => {
  if (targetUserId === adminId) {
    throw new AppError('You cannot deactivate your own account.', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) throw new AppError('User not found.', 404);

  return prisma.user.update({
    where: { id: targetUserId },
    data:  { isActive: !user.isActive },
    select: { id: true, name: true, email: true, isActive: true },
  });
};

module.exports = {
  register,
  login,
  refresh,
  getMe,
  changePassword,
  listUsers,
  toggleUserActive,
};