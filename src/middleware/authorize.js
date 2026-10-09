/**
 * Role-Based Authorization Middleware
 * 
 * Verifies that the authenticated user (populated on req.user by authenticate middleware)
 * possesses one of the required roles.
 * 
 * Usage:
 *   authorize('ADMIN')
 *   authorize('USER')
 *   authorize('ADMIN', 'USER')
 *   authorize(['ADMIN', 'USER'])
 * 
 * @param  {...string|string[]} roles - One or more allowed role names
 * @returns {Function} Express middleware function
 */
const authorize = (...roles) => {
  const allowedRoles = roles.flat();

  return (req, res, next) => {
    // 1. Authentication must come first: verify req.user exists
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // 2. Check if the authenticated user's role is permitted
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // 3. User is authorized; proceed to next handler
    next();
  };
};

module.exports = {
  authorize,
};
