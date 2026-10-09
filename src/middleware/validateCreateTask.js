/**
 * Middleware to validate task creation requests (POST /api/tasks)
 */
const validateCreateTask = (req, res, next) => {
  const { title, description, assignmentType, assigneeIds } = req.body || {};

  // 1. Validate title: required, must be string, not empty after trim, max 200 chars
  if (title === undefined || title === null) {
    return res.status(400).json({
      success: false,
      message: 'Title is required',
    });
  }

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

  // 2. Validate description: optional, if provided must be string
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Description must be a string when provided',
      });
    }
  }

  // 3. Validate assignmentType: optional, allowed values 'PERSONAL', 'TEAM'
  let effectiveAssignmentType = 'PERSONAL';
  if (assignmentType !== undefined && assignmentType !== null) {
    if (typeof assignmentType !== 'string' || !['PERSONAL', 'TEAM'].includes(assignmentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignmentType. Allowed values are PERSONAL or TEAM',
      });
    }
    effectiveAssignmentType = assignmentType;
  }

  // 4. Role check for TEAM assignmentType
  if (effectiveAssignmentType === 'TEAM') {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only administrators can create team tasks',
      });
    }

    // 5. Validate assigneeIds for TEAM: required, non-empty array, positive integers, unique
    if (assigneeIds === undefined || assigneeIds === null) {
      return res.status(400).json({
        success: false,
        message: 'assigneeIds is required for TEAM task creation',
      });
    }

    if (!Array.isArray(assigneeIds)) {
      return res.status(400).json({
        success: false,
        message: 'assigneeIds must be an array of user IDs',
      });
    }

    if (assigneeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'assigneeIds must be a non-empty array',
      });
    }

    for (const id of assigneeIds) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: 'All assignee IDs must be valid positive integers',
        });
      }
    }

    const uniqueAssigneeIds = new Set(assigneeIds);
    if (uniqueAssigneeIds.size !== assigneeIds.length) {
      return res.status(400).json({
        success: false,
        message: 'assigneeIds must not contain duplicate user IDs',
      });
    }
  } else {
    // 6. For PERSONAL tasks: reject unexpected assigneeIds
    if (assigneeIds !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'assigneeIds is not allowed for personal tasks',
      });
    }
  }

  // Attach sanitized inputs to req.sanitizedTask (client-supplied creator/role ignored)
  req.sanitizedTask = {
    title: trimmedTitle,
    description: description !== undefined && description !== null ? description.trim() : null,
    assignmentType: effectiveAssignmentType,
    assigneeIds: effectiveAssignmentType === 'TEAM' ? assigneeIds : undefined,
  };

  next();
};

module.exports = {
  validateCreateTask,
};
