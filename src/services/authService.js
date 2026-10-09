const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const SALT_ROUNDS = 10;

/**
 * Register a new user with strictly enforced role USER.
 * Hashes the password and checks for existing duplicate email.
 */
const registerUser = async ({ name, email, password }) => {
  // Check whether the email already exists in the database
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const error = new Error('Email is already registered');
    error.statusCode = 409;
    throw error;
  }

  // Securely hash password
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // Create new user with server-enforced role USER
  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: 'USER', // Server strictly enforces USER role; ignores any client-supplied role
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return newUser;
};

/**
 * Authenticate a user and issue a signed JWT token.
 * Validates password with bcrypt and enforces generic 401 error.
 */
const loginUser = async ({ email, password }) => {
  // Find user by normalized email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Generic 401 error message regardless of whether user exists or password fails
  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Compare plaintext password with stored bcrypt hash
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Ensure JWT_SECRET is configured
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const error = new Error('JWT secret configuration is missing on server');
    error.statusCode = 500;
    throw error;
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

  // Sign JWT with database-derived userId and role
  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    jwtSecret,
    { expiresIn }
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  };
};

module.exports = {
  registerUser,
  loginUser,
};
