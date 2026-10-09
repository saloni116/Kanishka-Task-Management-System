const authService = require('../services/authService');

/**
 * Handle user registration POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password } = req.sanitizedBody;

    const user = await authService.registerUser({ name, email, password });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    // Do not leak SQL errors or internal details to API client
    console.error('Registration internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Handle user login POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.sanitizedBody;

    const result = await authService.loginUser({ email, password });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        token: result.token,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    // Do not leak SQL errors or internal details to API client
    console.error('Login internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Verification endpoint to return the authenticated user's safe information
 * GET /api/auth/me (requires authenticate middleware)
 */
const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
};

/**
 * Verification endpoint for ADMIN-only authorization
 * GET /api/auth/admin-test (requires authenticate + authorize('ADMIN'))
 */
const adminTest = (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Admin authorization successful',
  });
};

/**
 * Verification endpoint for USER-only authorization
 * GET /api/auth/user-test (requires authenticate + authorize('USER'))
 */
const userTest = (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'User authorization successful',
  });
};

module.exports = {
  register,
  login,
  getMe,
  adminTest,
  userTest,
};
