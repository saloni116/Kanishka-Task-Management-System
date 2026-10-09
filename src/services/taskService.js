const prisma = require('../config/prisma');

const PRISMA_TO_PUBLIC_STATUS = {
  Pending: 'Pending',
  InProgress: 'In Progress',
  Testing: 'Testing',
  Completed: 'Completed',
};

/**
 * Format task response according to API conventions, ensuring safe fields.
 */
const formatTaskResponse = (task) => {
  const formattedStatus = PRISMA_TO_PUBLIC_STATUS[task.status] || task.status;

  return {
    id: task.id,
    user_id: task.userId,
    userId: task.userId,
    title: task.title,
    description: task.description,
    status: formattedStatus,
    created_at: task.createdAt,
    createdAt: task.createdAt,
    updated_at: task.updatedAt,
    updatedAt: task.updatedAt,
    creator: task.creator
      ? {
          id: task.creator.id,
          name: task.creator.name,
          email: task.creator.email,
          role: task.creator.role,
        }
      : undefined,
    assignments: task.taskAssignments
      ? task.taskAssignments.map((assignment) => ({
          id: assignment.id,
          task_id: assignment.taskId,
          taskId: assignment.taskId,
          user_id: assignment.userId,
          userId: assignment.userId,
          user: assignment.user
            ? {
                id: assignment.user.id,
                name: assignment.user.name,
                email: assignment.user.email,
                role: assignment.user.role,
              }
            : undefined,
        }))
      : [],
  };
};

/**
 * Create a new task (personal or team) with atomic assignments.
 * 
 * @param {Object} params
 * @param {number} params.creatorId - Authenticated user's database ID
 * @param {string} params.creatorRole - Authenticated user's database role
 * @param {string} params.title - Validated task title
 * @param {string|null} params.description - Optional task description
 * @param {string} params.assignmentType - 'PERSONAL' or 'TEAM'
 * @param {number[]} [params.assigneeIds] - Array of assignee IDs (for TEAM tasks)
 */
const createTask = async ({
  creatorId,
  creatorRole,
  title,
  description,
  assignmentType,
  assigneeIds,
}) => {
  if (assignmentType === 'TEAM') {
    // 1. Role verification (defense in depth)
    if (creatorRole !== 'ADMIN') {
      const error = new Error('Access denied: Only administrators can create team tasks');
      error.statusCode = 403;
      throw error;
    }

    // 2. Query all requested assignees from database
    const users = await prisma.user.findMany({
      where: {
        id: { in: assigneeIds },
      },
      select: {
        id: true,
        role: true,
      },
    });

    // 3. Verify that every requested assignee exists in the database
    if (users.length !== assigneeIds.length) {
      const error = new Error('One or more assignee IDs do not exist');
      error.statusCode = 400;
      throw error;
    }

    // 4. Verify that all assignees have role USER (reject ADMIN accounts)
    const adminAssignee = users.find((u) => u.role === 'ADMIN');
    if (adminAssignee) {
      const error = new Error('Cannot assign tasks to ADMIN accounts; assignees must have role USER');
      error.statusCode = 400;
      throw error;
    }

    // 5. Atomically create the Task and all TaskAssignment records
    const task = await prisma.$transaction(async (tx) => {
      return tx.task.create({
        data: {
          userId: creatorId,
          title,
          description,
          status: 'Pending',
          taskAssignments: {
            create: assigneeIds.map((id) => ({
              userId: id,
            })),
          },
        },
        include: {
          taskAssignments: {
            select: {
              id: true,
              taskId: true,
              userId: true,
            },
          },
        },
      });
    });

    return formatTaskResponse(task);
  }

  // PERSONAL task creation
  // Authenticated user is both creator and the sole assignee
  const task = await prisma.$transaction(async (tx) => {
    return tx.task.create({
      data: {
        userId: creatorId,
        title,
        description,
        status: 'Pending',
        taskAssignments: {
          create: {
            userId: creatorId,
          },
        },
      },
      include: {
        taskAssignments: {
          select: {
            id: true,
            taskId: true,
            userId: true,
          },
        },
      },
    });
  });

  return formatTaskResponse(task);
};

/**
 * Retrieve tasks based on role-based visibility rules:
 * - ADMIN: Views all tasks with creator and assignment information.
 * - USER: Views only tasks assigned to them via task_assignments (enforced at database query level).
 * 
 * Orders tasks deterministically in newest-first order (createdAt desc, id desc).
 * 
 * @param {Object} params
 * @param {number} params.userId - Authenticated user's database ID
 * @param {string} params.role - Authenticated user's database role ('ADMIN' | 'USER')
 */
const getTasks = async ({ userId, role }) => {
  // Enforce visibility strictly at the database level:
  // - ADMIN gets empty filter (all tasks)
  // - USER gets taskAssignments: { some: { userId } } filter
  const where = role === 'ADMIN'
    ? {}
    : {
        taskAssignments: {
          some: {
            userId,
          },
        },
      };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      taskAssignments: {
        select: {
          id: true,
          taskId: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      },
    },
  });

  return tasks.map(formatTaskResponse);
};

/**
 * Retrieve a specific task by ID based on role-based access rules:
 * - ADMIN: Can retrieve any existing task by ID.
 * - USER: Can retrieve a task only if assigned to them via task_assignments.
 *   Returns 404 if the task does not exist OR if the user is not assigned to it (non-disclosing).
 * 
 * @param {Object} params
 * @param {number} params.taskId - Validated integer task ID
 * @param {number} params.userId - Authenticated user's database ID
 * @param {string} params.role - Authenticated user's database role ('ADMIN' | 'USER')
 */
const getTaskById = async ({ taskId, userId, role }) => {
  // Enforce visibility strictly at the database level:
  // - ADMIN can find any task by primary key
  // - USER can find task only if assigned to it in task_assignments
  const where = role === 'ADMIN'
    ? { id: taskId }
    : {
        id: taskId,
        taskAssignments: {
          some: {
            userId,
          },
        },
      };

  const task = await prisma.task.findFirst({
    where,
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      taskAssignments: {
        select: {
          id: true,
          taskId: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      },
    },
  });

  if (!task) {
    const error = new Error('Task not found');
    error.statusCode = 404;
    throw error;
  }

  return formatTaskResponse(task);
};

/**
 * Update an existing task's title and/or description.
 * Enforces role-based permissions:
 * - ADMIN: Can update any task (personal or team).
 * - USER: Can update only their own personal task (must be creator and sole assignee).
 *   Returns 404 for nonexistent tasks or tasks the user is not permitted to edit (non-disclosing).
 * 
 * @param {Object} params
 * @param {number} params.taskId - Validated integer task ID
 * @param {number} params.userId - Authenticated user's database ID
 * @param {string} params.role - Authenticated user's database role ('ADMIN' | 'USER')
 * @param {Object} params.updates - Sanitized updates object containing title and/or description
 */
const updateTask = async ({ taskId, userId, role, updates }) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch task with assignment details
    const existingTask = await tx.task.findUnique({
      where: { id: taskId },
      include: {
        taskAssignments: true,
      },
    });

    if (!existingTask) {
      const error = new Error('Task not found');
      error.statusCode = 404;
      throw error;
    }

    // 2. Role-based authorization: USER can only edit their own personal task
    if (role === 'USER') {
      const isPersonalTask =
        existingTask.userId === userId &&
        existingTask.taskAssignments.length === 1 &&
        existingTask.taskAssignments[0].userId === userId;

      if (!isPersonalTask) {
        const error = new Error('Task not found');
        error.statusCode = 404;
        throw error;
      }
    }

    // 3. Atomically update only supplied editable fields (title, description)
    const updatedTask = await tx.task.update({
      where: { id: taskId },
      data: updates,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        taskAssignments: {
          select: {
            id: true,
            taskId: true,
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
    });

    return formatTaskResponse(updatedTask);
  });
};

/**
 * Update the status of an existing task (Admin-only).
 * 
 * @param {Object} params
 * @param {number} params.taskId - Validated integer task ID
 * @param {string} params.prismaStatus - Mapped Prisma enum value ('Pending' | 'InProgress' | 'Testing' | 'Completed')
 */
const updateTaskStatus = async ({ taskId, prismaStatus }) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Verify task exists
    const existingTask = await tx.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      const error = new Error('Task not found');
      error.statusCode = 404;
      throw error;
    }

    // 2. Atomically update only the status field
    const updatedTask = await tx.task.update({
      where: { id: taskId },
      data: {
        status: prismaStatus,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        taskAssignments: {
          select: {
            id: true,
            taskId: true,
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
    });

    return formatTaskResponse(updatedTask);
  });
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
};
