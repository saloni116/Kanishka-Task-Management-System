const taskService = require('../services/taskService');

/**
 * Handle retrieving task list GET /api/tasks
 */
const getTasks = async (req, res) => {
  try {
    const tasks = await taskService.getTasks({
      userId: req.user.id,
      role: req.user.role,
    });

    return res.status(200).json({
      success: true,
      message: 'Tasks retrieved successfully',
      data: tasks,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    // Do not leak SQL errors or internal details to API client
    console.error('Get tasks internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Handle retrieving a single task by ID GET /api/tasks/:id
 */
const getTaskById = async (req, res) => {
  try {
    const rawId = req.params.id;

    // Validate ID: must be a positive integer
    if (!/^\d+$/.test(rawId) || parseInt(rawId, 10) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID',
      });
    }

    const taskId = parseInt(rawId, 10);

    const task = await taskService.getTaskById({
      taskId,
      userId: req.user.id,
      role: req.user.role,
    });

    return res.status(200).json({
      success: true,
      message: 'Task retrieved successfully',
      data: task,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    // Do not leak SQL errors or internal details to API client
    console.error('Get task by ID internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Handle task creation POST /api/tasks
 */
const createTask = async (req, res) => {
  try {
    const { title, description, assignmentType, assigneeIds } = req.sanitizedTask;

    const task = await taskService.createTask({
      creatorId: req.user.id,
      creatorRole: req.user.role,
      title,
      description,
      assignmentType,
      assigneeIds,
    });

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    // Do not leak SQL errors or internal details to API client
    console.error('Task creation internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Handle task update PATCH /api/tasks/:id
 */
const updateTask = async (req, res) => {
  try {
    const rawId = req.params.id;

    // Validate ID: must be a positive integer
    if (!/^\d+$/.test(rawId) || parseInt(rawId, 10) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID',
      });
    }

    const taskId = parseInt(rawId, 10);

    const task = await taskService.updateTask({
      taskId,
      userId: req.user.id,
      role: req.user.role,
      updates: req.sanitizedUpdates,
    });

    return res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      data: task,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    // Do not leak SQL errors or internal details to API client
    console.error('Update task internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Handle task status update PATCH /api/tasks/:id/status (Admin-only)
 */
const updateTaskStatus = async (req, res) => {
  try {
    const rawId = req.params.id;

    // Validate ID: must be a positive integer
    if (!/^\d+$/.test(rawId) || parseInt(rawId, 10) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID',
      });
    }

    const taskId = parseInt(rawId, 10);

    const task = await taskService.updateTaskStatus({
      taskId,
      prismaStatus: req.sanitizedStatus.prismaStatus,
    });

    return res.status(200).json({
      success: true,
      message: 'Task status updated successfully',
      data: task,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    // Do not leak SQL errors or internal details to API client
    console.error('Update task status internal error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

module.exports = {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
};
