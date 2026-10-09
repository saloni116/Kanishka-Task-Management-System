/**
 * Middleware to validate and sanitize user registration input
 */
const validateRegistration = (req, res, next) => {
  const { name, email, password } = req.body || {};

  // 1. Validate Name (required, non-empty string after trimming)
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Name is required and must be a non-empty string',
    });
  }

  // 2. Validate Email (required, valid email pattern)
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

  // 3. Validate Password (required, string, minimum length 6)
  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Password is required',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long',
    });
  }

  // Attach sanitized inputs to request object
  req.sanitizedBody = {
    name: name.trim(),
    email: normalizedEmail,
    password,
  };

  next();
};

module.exports = {
  validateRegistration,
};
