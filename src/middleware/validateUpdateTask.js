/**
 * Middleware to validate task update requests (PATCH /api/tasks/:id)
 * Enforces strict allowlist: only 'title' and 'description' are allowed.
 * Rejects mass assignment or forbidden fields with HTTP 400.
 */
const validateUpdateTask = (req, res, next) => {
  // 1. Validate request body is a non-empty object
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Request body cannot be empty',
    });
  }

  // 2. Strict allowlist check: Reject unexpected or forbidden fields (mass-assignment protection)
  const allowedKeys = ['title', 'description'];
  const bodyKeys = Object.keys(req.body);
  const forbiddenKeys = bodyKeys.filter((key) => !allowedKeys.includes(key));

  if (forbiddenKeys.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid or forbidden fields in request body: ${forbiddenKeys.join(', ')}. Only 'title' and 'description' can be updated.`,
    });
  }

  // 3. Ensure at least one editable field is provided
  if (!('title' in req.body) && !('description' in req.body)) {
    return res.status(400).json({
      success: false,
      message: 'At least one editable field (title or description) must be provided',
    });
  }

  const sanitizedUpdates = {};

  // 4. Validate title if provided
  if ('title' in req.body) {
    const { title } = req.body;

    if (typeof title !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Title must be a string',
      });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title cannot be empty or whitespace only',
      });
    }

    if (trimmedTitle.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Title cannot exceed 200 characters',
      });
    }

    sanitizedUpdates.title = trimmedTitle;
  }

  // 5. Validate description if provided
  if ('description' in req.body) {
    const { description } = req.body;

    if (typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Description must be a string',
      });
    }

    sanitizedUpdates.description = description.trim();
  }

  req.sanitizedUpdates = sanitizedUpdates;
  next();
};

module.exports = {
  validateUpdateTask,
};
