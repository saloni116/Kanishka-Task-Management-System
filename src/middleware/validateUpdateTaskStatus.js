/**
 * Middleware to validate task status update requests (PATCH /api/tasks/:id/status)
 * Enforces strict allowlist: only 'status' is allowed.
 * Rejects unexpected or forbidden properties with HTTP 400.
 */
const ALLOWED_STATUSES = ['Pending', 'In Progress', 'Testing', 'Completed'];

const STATUS_TO_PRISMA = {
  'Pending': 'Pending',
  'In Progress': 'InProgress',
  'Testing': 'Testing',
  'Completed': 'Completed',
};

const validateUpdateTaskStatus = (req, res, next) => {
  // 1. Validate request body is a non-empty object
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Request body cannot be empty',
    });
  }

  // 2. Strict allowlist check: Reject unexpected or protected fields
  const allowedKeys = ['status'];
  const bodyKeys = Object.keys(req.body);
  const forbiddenKeys = bodyKeys.filter((key) => !allowedKeys.includes(key));

  if (forbiddenKeys.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid or forbidden fields in request body: ${forbiddenKeys.join(', ')}. Only 'status' can be updated.`,
    });
  }

  // 3. Ensure status is present
  if (!('status' in req.body)) {
    return res.status(400).json({
      success: false,
      message: 'Status is required',
    });
  }

  const { status } = req.body;

  // 4. Validate status type: must be a string (reject null, number, boolean, array, object)
  if (typeof status !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Status must be a string',
    });
  }

  // 5. Validate status value against allowed public status strings
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status: "${status}". Allowed values are: ${ALLOWED_STATUSES.join(', ')}`,
    });
  }

  // Attach sanitized status mapped to Prisma enum representation
  req.sanitizedStatus = {
    publicStatus: status,
    prismaStatus: STATUS_TO_PRISMA[status],
  };

  next();
};

module.exports = {
  validateUpdateTaskStatus,
  ALLOWED_STATUSES,
  STATUS_TO_PRISMA,
};
