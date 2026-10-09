require('dotenv').config();
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const prisma = require('../config/prisma');

async function runGetTaskByIdTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const testResults = [];
  const createdUserIds = [];

  function record(test, expected, actual, passed) {
    testResults.push({
      test,
      expected,
      actual,
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  try {
    // 0. Setup: Clean up any pre-existing tasks and assignments
    await prisma.taskAssignment.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          notIn: ['admin@example.com', 'user@example.com'],
        },
      },
    });

    // Obtain seeded accounts
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    const user1 = await prisma.user.findUnique({ where: { email: 'user@example.com' } });

    if (!adminUser || !user1) {
      throw new Error('Seed users admin@example.com and user@example.com must exist.');
    }

    // Create User 2 (for team task sharing & isolated tasks)
    const passwordHash = await bcrypt.hash('TestPass@123', 10);
    const user2 = await prisma.user.create({
      data: {
        name: 'Test User Two',
        email: 'user2_byid_test@example.com',
        password: passwordHash,
        role: 'USER',
      },
    });
    createdUserIds.push(user2.id);

    // Create User 3 (unassigned user)
    const user3 = await prisma.user.create({
      data: {
        name: 'Test User Three (Unassigned)',
        email: 'user3_byid_test@example.com',
        password: passwordHash,
        role: 'USER',
      },
    });
    createdUserIds.push(user3.id);

    // Obtain login tokens
    const loginUser = async (email, password) => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      return body?.data?.token;
    };

    const adminToken = await loginUser('admin@example.com', 'Admin@123');
    const user1Token = await loginUser('user@example.com', 'User@123');
    const user2Token = await loginUser('user2_byid_test@example.com', 'TestPass@123');
    const user3Token = await loginUser('user3_byid_test@example.com', 'TestPass@123');

    // Create Test Fixture Tasks:
    // Task 1: Personal task by user 1 (assignee: user 1)
    const task1 = await prisma.task.create({
      data: {
        userId: user1.id,
        title: 'Task 1: User 1 Personal Task',
        description: 'Personal task created by user 1',
        status: 'Pending',
        taskAssignments: {
          create: { userId: user1.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 2: Personal task by admin (assignee: admin)
    const task2 = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Task 2: Admin Personal Task',
        description: 'Personal task created by admin',
        status: 'InProgress',
        taskAssignments: {
          create: { userId: adminUser.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 3: Team task by admin assigned to user 1 and user 2
    const task3 = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Task 3: Team Task for Users 1 and 2',
        description: 'Team task with multiple assignees',
        status: 'Testing',
        taskAssignments: {
          create: [
            { userId: user1.id },
            { userId: user2.id },
          ],
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 4: Team task by admin assigned ONLY to user 2
    const task4 = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Task 4: Team Task for User 2 Only',
        description: 'Team task assigned exclusively to user 2',
        status: 'Pending',
        taskAssignments: {
          create: { userId: user2.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 5: Personal task by user 2 (assignee: user 2)
    const task5 = await prisma.task.create({
      data: {
        userId: user2.id,
        title: 'Task 5: User 2 Personal Task',
        description: 'Personal task created by user 2',
        status: 'Completed',
        taskAssignments: {
          create: { userId: user2.id },
        },
      },
    });

    // Helper function to call GET /api/tasks/:id
    const fetchTaskById = async (id, token) => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${baseUrl}/api/tasks/${id}`, { headers });
      const body = await res.json();
      return { status: res.status, body };
    };

    // ==========================================
    // A. ADMIN ACCESS
    // ==========================================

    // TEST 1: Admin retrieves an existing personal task
    const resAdminPersonal = await fetchTaskById(task2.id, adminToken);
    record(
      'TEST 1: Admin retrieves an existing personal task',
      '200 OK with task details and creator/assignment info',
      `Status: ${resAdminPersonal.status}, id: ${resAdminPersonal.body?.data?.id}`,
      resAdminPersonal.status === 200 && resAdminPersonal.body?.data?.id === task2.id
    );

    // TEST 2: Admin retrieves an existing team task
    const resAdminTeam = await fetchTaskById(task3.id, adminToken);
    record(
      'TEST 2: Admin retrieves an existing team task',
      '200 OK with team task details',
      `Status: ${resAdminTeam.status}, id: ${resAdminTeam.body?.data?.id}`,
      resAdminTeam.status === 200 && resAdminTeam.body?.data?.id === task3.id
    );

    // TEST 3: Admin retrieves tasks created by different users
    const resAdminTask1 = await fetchTaskById(task1.id, adminToken);
    const resAdminTask5 = await fetchTaskById(task5.id, adminToken);
    const isTest3Pass =
      resAdminTask1.status === 200 &&
      resAdminTask1.body?.data?.id === task1.id &&
      resAdminTask5.status === 200 &&
      resAdminTask5.body?.data?.id === task5.id;
    record(
      'TEST 3: Admin retrieves tasks created by different users',
      '200 OK for tasks created by User 1 and User 2',
      `Task 1 status: ${resAdminTask1.status}, Task 5 status: ${resAdminTask5.status}`,
      isTest3Pass
    );

    // TEST 4: Admin receives creator information
    const taskCreator = resAdminTask1.body?.data?.creator;
    const isTest4Pass =
      Boolean(taskCreator) &&
      taskCreator.id === user1.id &&
      taskCreator.email === user1.email &&
      taskCreator.role === 'USER';
    record(
      'TEST 4: Admin receives creator information',
      'creator object with id, name, email, role',
      `Creator: id=${taskCreator?.id}, email=${taskCreator?.email}, role=${taskCreator?.role}`,
      isTest4Pass
    );

    // TEST 5: Admin receives all assignment records for a multi-assignee team task
    const teamAssignments = resAdminTeam.body?.data?.assignments;
    const teamAssigneeIds = Array.isArray(teamAssignments)
      ? teamAssignments.map((a) => a.user_id).sort((a, b) => a - b)
      : [];
    const expectedTeamAssigneeIds = [user1.id, user2.id].sort((a, b) => a - b);
    const isTest5Pass =
      Array.isArray(teamAssignments) &&
      teamAssignments.length === 2 &&
      JSON.stringify(teamAssigneeIds) === JSON.stringify(expectedTeamAssigneeIds);
    record(
      'TEST 5: Admin receives all assignment records for a multi-assignee team task',
      'assignments array with all assigned users [user1, user2]',
      `Assignments count: ${teamAssignments?.length}, assignees: [${teamAssigneeIds}]`,
      isTest5Pass
    );

    // ==========================================
    // B. REGULAR USER ACCESS
    // ==========================================

    // TEST 6: User retrieves their own personal task
    const resUser1Personal = await fetchTaskById(task1.id, user1Token);
    record(
      'TEST 6: User retrieves their own personal task',
      '200 OK with task details',
      `Status: ${resUser1Personal.status}, id: ${resUser1Personal.body?.data?.id}`,
      resUser1Personal.status === 200 && resUser1Personal.body?.data?.id === task1.id
    );

    // TEST 7: User retrieves a team task assigned to them
    const resUser1Team = await fetchTaskById(task3.id, user1Token);
    record(
      'TEST 7: User retrieves a team task assigned to them',
      '200 OK with team task details',
      `Status: ${resUser1Team.status}, id: ${resUser1Team.body?.data?.id}`,
      resUser1Team.status === 200 && resUser1Team.body?.data?.id === task3.id
    );

    // TEST 8: User cannot retrieve a task assigned exclusively to another user
    const resUser1Exclusive = await fetchTaskById(task5.id, user1Token);
    record(
      'TEST 8: User cannot retrieve a task assigned exclusively to another user',
      '404 Not Found (non-disclosing)',
      `Status: ${resUser1Exclusive.status}, message: "${resUser1Exclusive.body?.message}"`,
      resUser1Exclusive.status === 404 && resUser1Exclusive.body?.success === false
    );

    // TEST 9: User cannot retrieve an admin-created team task assigned only to another user
    const resUser1AdminTeamOther = await fetchTaskById(task4.id, user1Token);
    record(
      'TEST 9: User cannot retrieve an admin-created team task assigned only to another user',
      '404 Not Found (non-disclosing)',
      `Status: ${resUser1AdminTeamOther.status}, message: "${resUser1AdminTeamOther.body?.message}"`,
      resUser1AdminTeamOther.status === 404 && resUser1AdminTeamOther.body?.success === false
    );

    // TEST 10: A task's creator being an admin does not grant visibility to an unassigned regular user
    const resUser3AdminPersonal = await fetchTaskById(task2.id, user3Token);
    const resUser3AdminTeam = await fetchTaskById(task4.id, user3Token);
    const isTest10Pass =
      resUser3AdminPersonal.status === 404 &&
      resUser3AdminTeam.status === 404;
    record(
      'TEST 10: Creator being an admin does not grant visibility to unassigned regular user',
      '404 Not Found for both admin tasks',
      `Task 2 status: ${resUser3AdminPersonal.status}, Task 4 status: ${resUser3AdminTeam.status}`,
      isTest10Pass
    );

    // ==========================================
    // C. NOT FOUND AND INPUT VALIDATION
    // ==========================================

    // TEST 11: A nonexistent task ID returns HTTP 404
    const resNonexistent = await fetchTaskById(999999, adminToken);
    record(
      'TEST 11: A nonexistent task ID returns HTTP 404',
      '404 Not Found with "Task not found"',
      `Status: ${resNonexistent.status}, message: "${resNonexistent.body?.message}"`,
      resNonexistent.status === 404 && resNonexistent.body?.message === 'Task not found'
    );

    // TEST 12: An existing but unauthorized task returns the agreed non-disclosing HTTP 404 behavior
    const resUnauthorizedUser = await fetchTaskById(task4.id, user1Token);
    const isTest12Pass =
      resUnauthorizedUser.status === 404 &&
      resUnauthorizedUser.body?.message === resNonexistent.body?.message &&
      !resUnauthorizedUser.body?.data;
    record(
      'TEST 12: Existing but unauthorized task returns non-disclosing HTTP 404 behavior',
      '404 Not Found with identical message "Task not found" (no existence leakage)',
      `Status: ${resUnauthorizedUser.status}, message: "${resUnauthorizedUser.body?.message}"`,
      isTest12Pass
    );

    // TEST 13: A malformed task ID returns an appropriate client error
    const resMalformedString = await fetchTaskById('invalid-abc', adminToken);
    record(
      'TEST 13: A malformed task ID returns an appropriate client error',
      '400 Bad Request with "Invalid task ID"',
      `Status: ${resMalformedString.status}, message: "${resMalformedString.body?.message}"`,
      resMalformedString.status === 400 && resMalformedString.body?.message === 'Invalid task ID'
    );

    // TEST 14: Missing ID or invalid route input is handled safely where applicable
    const resNegativeId = await fetchTaskById('-5', adminToken);
    const resZeroId = await fetchTaskById('0', adminToken);
    const resFloatId = await fetchTaskById('1.5', adminToken);
    const isTest14Pass =
      resNegativeId.status === 400 &&
      resZeroId.status === 400 &&
      resFloatId.status === 400;
    record(
      'TEST 14: Invalid route inputs (negative, zero, floating point) handled safely',
      '400 Bad Request for all invalid ID formats',
      `Negative: ${resNegativeId.status}, Zero: ${resZeroId.status}, Float: ${resFloatId.status}`,
      isTest14Pass
    );

    // ==========================================
    // D. AUTHENTICATION
    // ==========================================

    // TEST 15: Missing token returns HTTP 401
    const resNoToken = await fetchTaskById(task1.id, null);
    record(
      'TEST 15: Missing token returns HTTP 401',
      '401 Unauthorized',
      `Status: ${resNoToken.status}, message: "${resNoToken.body?.message}"`,
      resNoToken.status === 401 && resNoToken.body?.success === false
    );

    // TEST 16: Invalid token returns HTTP 401
    const resInvalidToken = await fetchTaskById(task1.id, 'invalid.tampered.jwt');
    record(
      'TEST 16: Invalid token returns HTTP 401',
      '401 Unauthorized',
      `Status: ${resInvalidToken.status}, message: "${resInvalidToken.body?.message}"`,
      resInvalidToken.status === 401 && resInvalidToken.body?.success === false
    );

    // TEST 17: Expired token returns HTTP 401
    const expiredJwt = jwt.sign(
      { userId: user1.id, role: 'USER' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const resExpiredToken = await fetchTaskById(task1.id, expiredJwt);
    record(
      'TEST 17: Expired token returns HTTP 401',
      '401 Unauthorized with "Invalid or expired token"',
      `Status: ${resExpiredToken.status}, message: "${resExpiredToken.body?.message}"`,
      resExpiredToken.status === 401 && resExpiredToken.body?.success === false
    );

    // ==========================================
    // E. RESPONSE SECURITY AND DATA QUALITY
    // ==========================================

    // TEST 18: No password or password-hash fields appear in the response
    const jsonAdminTeam = JSON.stringify(resAdminTeam.body);
    const jsonUserTeam = JSON.stringify(resUser1Team.body);
    const hasPasswordLeak =
      jsonAdminTeam.toLowerCase().includes('password') ||
      jsonAdminTeam.toLowerCase().includes('$2b$') ||
      jsonUserTeam.toLowerCase().includes('password') ||
      jsonUserTeam.toLowerCase().includes('$2b$');
    record(
      'TEST 18: No password or password-hash fields appear in the response',
      'Response body strictly contains no password or bcrypt hash fields',
      `Leak detected: ${hasPasswordLeak}`,
      !hasPasswordLeak
    );

    // TEST 19: Creator and assignee information contains only approved safe fields
    const taskData = resAdminTeam.body?.data;
    const creatorKeys = taskData?.creator ? Object.keys(taskData.creator).sort() : [];
    const expectedKeys = ['email', 'id', 'name', 'role'];
    const assigneeKeys = taskData?.assignments?.[0]?.user
      ? Object.keys(taskData.assignments[0].user).sort()
      : [];
    const isTest19Pass =
      JSON.stringify(creatorKeys) === JSON.stringify(expectedKeys) &&
      JSON.stringify(assigneeKeys) === JSON.stringify(expectedKeys);
    record(
      'TEST 19: Creator and assignee information contains only approved safe fields',
      'Strictly [email, id, name, role] on creator and assignee users',
      `Creator: [${creatorKeys}], Assignee: [${assigneeKeys}]`,
      isTest19Pass
    );

    // TEST 20: A task with multiple assignments appears once with a complete assignments array
    const isTest20Pass =
      taskData?.id === task3.id &&
      Array.isArray(taskData?.assignments) &&
      taskData.assignments.length === 2 &&
      taskData.assignments[0].task_id === task3.id &&
      taskData.assignments[1].task_id === task3.id;
    record(
      'TEST 20: A task with multiple assignments appears once with a complete assignments array',
      'Single task object with assignments array containing 2 assignments',
      `Task id: ${taskData?.id}, assignments: ${taskData?.assignments?.length}`,
      isTest20Pass
    );

    // TEST 21: The response does not disclose details of inaccessible tasks
    const unauthBody = resUser1Exclusive.body;
    const isTest21Pass =
      resUser1Exclusive.status === 404 &&
      !('data' in unauthBody) &&
      !JSON.stringify(unauthBody).includes(task5.title);
    record(
      'TEST 21: The response does not disclose details of inaccessible tasks',
      'No data property and no task title/description in 404 error response',
      `Data field present: ${'data' in unauthBody}, Title leaked: ${JSON.stringify(unauthBody).includes(task5.title)}`,
      isTest21Pass
    );

    // TEST 22: GET by ID does not create, update, or delete database records
    const tasksCountBefore = await prisma.task.count();
    const assignmentsCountBefore = await prisma.taskAssignment.count();
    const usersCountBefore = await prisma.user.count();

    await fetchTaskById(task1.id, user1Token);
    await fetchTaskById(task2.id, adminToken);
    await fetchTaskById(task3.id, user1Token);
    await fetchTaskById(task4.id, user2Token);
    await fetchTaskById(task5.id, user2Token);
    await fetchTaskById(999999, adminToken);
    await fetchTaskById('invalid-id', adminToken);

    const tasksCountAfter = await prisma.task.count();
    const assignmentsCountAfter = await prisma.taskAssignment.count();
    const usersCountAfter = await prisma.user.count();

    const isTest22Pass =
      tasksCountBefore === tasksCountAfter &&
      assignmentsCountBefore === assignmentsCountAfter &&
      usersCountBefore === usersCountAfter;
    record(
      'TEST 22: GET by ID does not create, update, or delete database records',
      'Database row counts unchanged after multiple read queries',
      `Tasks diff: ${tasksCountAfter - tasksCountBefore}, Assignments diff: ${assignmentsCountAfter - assignmentsCountBefore}`,
      isTest22Pass
    );

    // Print summary report
    console.log('\n==================================================');
    console.log('STAGE 4C: GET /api/tasks/:id TEST RESULTS');
    console.log('==================================================');
    for (const r of testResults) {
      console.log(`\nTEST: ${r.test}`);
      console.log(`EXPECTED: ${r.expected}`);
      console.log(`ACTUAL: ${r.actual}`);
      console.log(`STATUS: ${r.status}`);
    }
    console.log('\n==================================================\n');

    console.log(JSON.stringify(testResults, null, 2));

    const anyFailed = testResults.some((t) => t.status === 'FAIL');
    process.exitCode = anyFailed ? 1 : 0;
  } catch (err) {
    console.error('Test execution failed with error:', err);
    process.exitCode = 1;
  } finally {
    try {
      // Clean up test tasks and assignments
      await prisma.taskAssignment.deleteMany({});
      await prisma.task.deleteMany({});

      // Clean up test users
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }

      // Verify seed accounts remain intact
      const remainingUsers = await prisma.user.findMany();
      console.log(`Cleanup complete. Remaining database users: ${remainingUsers.length} (${remainingUsers.map((u) => u.email).join(', ')})`);
    } catch (_) {}
    server.close();
    await prisma.$disconnect();
  }
}

runGetTaskByIdTests();
