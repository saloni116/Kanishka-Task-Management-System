const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

/**
 * Authentication Middleware
 * 
 * Verifies JWT from the Authorization header (Bearer <token>),
 * loads the authoritative user from PostgreSQL, and attaches
 * a safe user object to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    // 1. Verify Authorization header exists
    if (!authHeader || typeof authHeader !== 'string') {
      return res.status(401).json({
        success: false,
        message: 'Authentication required: Missing Authorization header',
      });
    }

    // 2. Validate Bearer token format
    const parts = authHeader.trim().split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required: Invalid Bearer token format',
      });
    }

    const token = parts[1];

    // 3. Ensure JWT secret is present in environment
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('Authentication Error: JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }

    // 4. Verify cryptographic signature and expiration
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      // Reject invalid signatures, expired tokens, or malformed JWTs safely
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // 5. Ensure valid userId exists in payload
    if (!decoded || typeof decoded.userId === 'undefined') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload: Missing user identity',
      });
    }

    // 6. Look up current user in PostgreSQL using Prisma
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication invalid: User does not exist',
      });
    }

    // 7. Attach safe user object to req.user (no passwords or hashes)
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // 8. Continue to next middleware or route handler
    next();
  } catch (error) {
    console.error('Authentication middleware internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

module.exports = {
  authenticate,
};
