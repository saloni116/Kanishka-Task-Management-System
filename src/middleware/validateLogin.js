/**
 * Middleware to validate and sanitize user login input
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body || {};

  // 1. Validate Email (required, valid email pattern)
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Email is required',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedEmail = email.trim().toLowerCase();
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email format',
    });
  }

  // 2. Validate Password (required)
  if (!password || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Password is required',
    });
  }

  // Attach sanitized inputs to request object
  req.sanitizedBody = {
    email: normalizedEmail,
    password,
  };

  next();
};

module.exports = {
  validateLogin,
};
