const express = require('express');
const { createTask, getTasks, getTaskById, updateTask, updateTaskStatus } = require('../controllers/taskController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { validateCreateTask } = require('../middleware/validateCreateTask');
const { validateUpdateTask } = require('../middleware/validateUpdateTask');
const { validateUpdateTaskStatus } = require('../middleware/validateUpdateTaskStatus');

const router = express.Router();

// GET /api/tasks - Retrieve task list based on user role visibility (Protected by authenticate)
router.get('/', authenticate, getTasks);

// POST /api/tasks - Create a personal or team task (Protected by authenticate)
router.post('/', authenticate, validateCreateTask, createTask);

// GET /api/tasks/:id - Retrieve specific task by ID (Protected by authenticate)
router.get('/:id', authenticate, getTaskById);

// PATCH /api/tasks/:id/status - Update task status (Protected by authenticate, ADMIN only)
router.patch('/:id/status', authenticate, authorize('ADMIN'), validateUpdateTaskStatus, updateTaskStatus);

// PATCH /api/tasks/:id - Update task title and/or description (Protected by authenticate)
router.patch('/:id', authenticate, validateUpdateTask, updateTask);

module.exports = router;
