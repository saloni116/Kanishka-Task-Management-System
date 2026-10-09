require('dotenv').config();
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const prisma = require('../config/prisma');

async function runUpdateTaskStatusTests() {
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

    // Create User 2 (for team task assignees)
    const passwordHash = await bcrypt.hash('TestPass@123', 10);
    const user2 = await prisma.user.create({
      data: {
        name: 'Test User Two',
        email: 'user2_status_test@example.com',
        password: passwordHash,
        role: 'USER',
      },
    });
    createdUserIds.push(user2.id);

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
    const user2Token = await loginUser('user2_status_test@example.com', 'TestPass@123');

    // Helper function to call PATCH /api/tasks/:id/status
    const patchTaskStatus = async (id, payload, token, rawBody = null) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}/api/tasks/${id}/status`, {
        method: 'PATCH',
        headers,
        body: rawBody !== null ? rawBody : JSON.stringify(payload),
      });

      let body;
      try {
        body = await res.json();
      } catch (err) {
        body = { error: 'Failed to parse JSON response' };
      }
      return { status: res.status, body };
    };

    // Create Fixture Tasks:
    // Task 1: Personal task by admin (status: Pending)
    const adminPersonalTask = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Admin Personal Task For Status Tests',
        description: 'Admin personal description',
        status: 'Pending',
        taskAssignments: {
          create: { userId: adminUser.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 2: Personal task by user 1 (status: Pending)
    const user1PersonalTask = await prisma.task.create({
      data: {
        userId: user1.id,
        title: 'User 1 Personal Task For Status Tests',
        description: 'User 1 personal description',
        status: 'Pending',
        taskAssignments: {
          create: { userId: user1.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 3: Team task by admin assigned to user 1 and user 2 (status: Pending)
    const teamTask = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Team Task For Status Tests',
        description: 'Team task description',
        status: 'Pending',
        taskAssignments: {
          create: [
            { userId: user1.id },
            { userId: user2.id },
          ],
        },
      },
    });

    // ==========================================
    // A. ADMIN STATUS UPDATES
    // ==========================================

    // TEST 1: Admin successfully changes a task from Pending to In Progress
    const resAdminInProgress = await patchTaskStatus(adminPersonalTask.id, {
      status: 'In Progress',
    }, adminToken);
    const dbAdminInProgress = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest1Pass =
      resAdminInProgress.status === 200 &&
      resAdminInProgress.body?.data?.status === 'In Progress' &&
      dbAdminInProgress.status === 'InProgress';
    record(
      'TEST 1: Admin successfully changes a task from Pending to In Progress',
      '200 OK, response status "In Progress", DB status "InProgress"',
      `Status: ${resAdminInProgress.status}, response status: "${resAdminInProgress.body?.data?.status}", DB: "${dbAdminInProgress?.status}"`,
      isTest1Pass
    );

    // TEST 2: Admin successfully changes a task to Testing
    const resAdminTesting = await patchTaskStatus(adminPersonalTask.id, {
      status: 'Testing',
    }, adminToken);
    const dbAdminTesting = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest2Pass =
      resAdminTesting.status === 200 &&
      resAdminTesting.body?.data?.status === 'Testing' &&
      dbAdminTesting.status === 'Testing';
    record(
      'TEST 2: Admin successfully changes a task to Testing',
      '200 OK, response status "Testing", DB status "Testing"',
      `Status: ${resAdminTesting.status}, response status: "${resAdminTesting.body?.data?.status}", DB: "${dbAdminTesting?.status}"`,
      isTest2Pass
    );

    // TEST 3: Admin successfully changes a task to Completed
    const resAdminCompleted = await patchTaskStatus(adminPersonalTask.id, {
      status: 'Completed',
    }, adminToken);
    const dbAdminCompleted = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest3Pass =
      resAdminCompleted.status === 200 &&
      resAdminCompleted.body?.data?.status === 'Completed' &&
      dbAdminCompleted.status === 'Completed';
    record(
      'TEST 3: Admin successfully changes a task to Completed',
      '200 OK, response status "Completed", DB status "Completed"',
      `Status: ${resAdminCompleted.status}, response status: "${resAdminCompleted.body?.data?.status}", DB: "${dbAdminCompleted?.status}"`,
      isTest3Pass
    );

    // TEST 4: Admin successfully changes a task back to Pending
    const resAdminPending = await patchTaskStatus(adminPersonalTask.id, {
      status: 'Pending',
    }, adminToken);
    const dbAdminPending = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest4Pass =
      resAdminPending.status === 200 &&
      resAdminPending.body?.data?.status === 'Pending' &&
      dbAdminPending.status === 'Pending';
    record(
      'TEST 4: Admin successfully changes a task back to Pending',
      '200 OK, response status "Pending", DB status "Pending"',
      `Status: ${resAdminPending.status}, response status: "${resAdminPending.body?.data?.status}", DB: "${dbAdminPending?.status}"`,
      isTest4Pass
    );

    // TEST 5: Admin can update the status of a personal task (e.g. user 1's personal task)
    const resAdminUserTask = await patchTaskStatus(user1PersonalTask.id, {
      status: 'In Progress',
    }, adminToken);
    const dbUser1Task = await prisma.task.findUnique({ where: { id: user1PersonalTask.id } });
    const isTest5Pass =
      resAdminUserTask.status === 200 &&
      resAdminUserTask.body?.data?.status === 'In Progress' &&
      dbUser1Task.status === 'InProgress';
    record(
      'TEST 5: Admin can update the status of a personal task',
      '200 OK, status updated to "In Progress" in DB',
      `Status: ${resAdminUserTask.status}, DB status: "${dbUser1Task?.status}"`,
      isTest5Pass
    );

    // TEST 6: Admin can update the status of a team task
    const resAdminTeamTask = await patchTaskStatus(teamTask.id, {
      status: 'Testing',
    }, adminToken);
    const dbTeamTask = await prisma.task.findUnique({ where: { id: teamTask.id } });
    const isTest6Pass =
      resAdminTeamTask.status === 200 &&
      resAdminTeamTask.body?.data?.status === 'Testing' &&
      dbTeamTask.status === 'Testing';
    record(
      'TEST 6: Admin can update the status of a team task',
      '200 OK, status updated to "Testing" in DB',
      `Status: ${resAdminTeamTask.status}, DB status: "${dbTeamTask?.status}"`,
      isTest6Pass
    );

    // TEST 7: Successful responses contain the updated status
    const teamData = resAdminTeamTask.body?.data;
    const isTest7Pass =
      Boolean(teamData) &&
      teamData.id === teamTask.id &&
      teamData.status === 'Testing' &&
      Boolean(teamData.created_at) &&
      Boolean(teamData.updated_at) &&
      teamData.creator?.id === adminUser.id &&
      Array.isArray(teamData.assignments) &&
      teamData.assignments.length === 2;
    record(
      'TEST 7: Successful responses contain the updated status',
      'Response has updated status, creator, assignments, and timestamps',
      `status="${teamData?.status}", id=${teamData?.id}, assignees=${teamData?.assignments?.length}`,
      isTest7Pass
    );

    // ==========================================
    // B. USER RESTRICTIONS
    // ==========================================

    // TEST 8: A regular user receives HTTP 403 when attempting a status update
    const resUserForbidden = await patchTaskStatus(user1PersonalTask.id, {
      status: 'Completed',
    }, user1Token);
    record(
      'TEST 8: A regular user receives HTTP 403 when attempting a status update',
      '403 Forbidden with "Access denied"',
      `Status: ${resUserForbidden.status}, message: "${resUserForbidden.body?.message}"`,
      resUserForbidden.status === 403 && resUserForbidden.body?.message === 'Access denied'
    );

    // TEST 9: A regular user cannot change the status of their own personal task
    const dbUser1AfterForbidden = await prisma.task.findUnique({ where: { id: user1PersonalTask.id } });
    const isTest9Pass =
      dbUser1AfterForbidden.status === 'InProgress'; // Preserved from TEST 5 admin update
    record(
      'TEST 9: A regular user cannot change the status of their own personal task',
      'DB status remains unchanged (InProgress) after regular user request',
      `DB status: "${dbUser1AfterForbidden?.status}"`,
      isTest9Pass
    );

    // TEST 10: A regular user cannot change the status of a team task assigned to them
    const resUserTeamForbidden = await patchTaskStatus(teamTask.id, {
      status: 'Completed',
    }, user1Token);
    record(
      'TEST 10: A regular user cannot change the status of a team task assigned to them',
      '403 Forbidden with "Access denied"',
      `Status: ${resUserTeamForbidden.status}, message: "${resUserTeamForbidden.body?.message}"`,
      resUserTeamForbidden.status === 403 && resUserTeamForbidden.body?.message === 'Access denied'
    );

    // TEST 11: Unauthorized attempts do not modify the database
    const dbTeamAfterForbidden = await prisma.task.findUnique({ where: { id: teamTask.id } });
    const isTest11Pass =
      dbTeamAfterForbidden.status === 'Testing' &&
      dbTeamAfterForbidden.updatedAt.getTime() === dbTeamTask.updatedAt.getTime();
    record(
      'TEST 11: Unauthorized attempts do not modify the database',
      'DB status and updatedAt remain completely unchanged',
      `Status unchanged: ${dbTeamAfterForbidden.status === 'Testing'}, timestamp matches: true`,
      isTest11Pass
    );

    // ==========================================
    // C. STATUS VALIDATION
    // ==========================================

    // TEST 12: Missing status returns HTTP 400
    const resMissingStatus = await patchTaskStatus(adminPersonalTask.id, { otherProp: 'test' }, adminToken);
    record(
      'TEST 12: Missing status returns HTTP 400',
      '400 Bad Request with forbidden fields message or status is required',
      `Status: ${resMissingStatus.status}, message: "${resMissingStatus.body?.message}"`,
      resMissingStatus.status === 400 && resMissingStatus.body?.success === false
    );

    // TEST 13: Empty string returns HTTP 400
    const resEmptyStringStatus = await patchTaskStatus(adminPersonalTask.id, { status: '' }, adminToken);
    record(
      'TEST 13: Empty string returns HTTP 400',
      '400 Bad Request for empty string status',
      `Status: ${resEmptyStringStatus.status}, message: "${resEmptyStringStatus.body?.message}"`,
      resEmptyStringStatus.status === 400 && resEmptyStringStatus.body?.success === false
    );

    // TEST 14: Unsupported status "Done" returns HTTP 400
    const resDoneStatus = await patchTaskStatus(adminPersonalTask.id, { status: 'Done' }, adminToken);
    record(
      'TEST 14: Unsupported status "Done" returns HTTP 400',
      '400 Bad Request for unsupported status value "Done"',
      `Status: ${resDoneStatus.status}, message: "${resDoneStatus.body?.message}"`,
      resDoneStatus.status === 400 && resDoneStatus.body?.success === false
    );

    // TEST 15: Lowercase "pending" returns HTTP 400
    const resLowercaseStatus = await patchTaskStatus(adminPersonalTask.id, { status: 'pending' }, adminToken);
    record(
      'TEST 15: Lowercase "pending" returns HTTP 400',
      '400 Bad Request for case-sensitive mismatch "pending"',
      `Status: ${resLowercaseStatus.status}, message: "${resLowercaseStatus.body?.message}"`,
      resLowercaseStatus.status === 400 && resLowercaseStatus.body?.success === false
    );

    // TEST 16: Null status returns HTTP 400
    const resNullStatus = await patchTaskStatus(adminPersonalTask.id, { status: null }, adminToken);
    record(
      'TEST 16: Null status returns HTTP 400',
      '400 Bad Request for null status',
      `Status: ${resNullStatus.status}, message: "${resNullStatus.body?.message}"`,
      resNullStatus.status === 400 && resNullStatus.body?.success === false
    );

    // TEST 17: Numeric status returns HTTP 400
    const resNumberStatus = await patchTaskStatus(adminPersonalTask.id, { status: 123 }, adminToken);
    record(
      'TEST 17: Numeric status returns HTTP 400',
      '400 Bad Request for numeric status',
      `Status: ${resNumberStatus.status}, message: "${resNumberStatus.body?.message}"`,
      resNumberStatus.status === 400 && resNumberStatus.body?.success === false
    );

    // TEST 18: Array or object status returns HTTP 400
    const resArrayStatus = await patchTaskStatus(adminPersonalTask.id, { status: ['Completed'] }, adminToken);
    const resObjectStatus = await patchTaskStatus(adminPersonalTask.id, { status: { state: 'Completed' } }, adminToken);
    const isTest18Pass =
      resArrayStatus.status === 400 &&
      resObjectStatus.status === 400;
    record(
      'TEST 18: Array or object status returns HTTP 400',
      '400 Bad Request for array and object status values',
      `Array status: ${resArrayStatus.status}, Object status: ${resObjectStatus.status}`,
      isTest18Pass
    );

    // TEST 19: An empty request body returns HTTP 400
    const resEmptyBody = await patchTaskStatus(adminPersonalTask.id, {}, adminToken);
    record(
      'TEST 19: An empty request body returns HTTP 400',
      '400 Bad Request with "Request body cannot be empty"',
      `Status: ${resEmptyBody.status}, message: "${resEmptyBody.body?.message}"`,
      resEmptyBody.status === 400 && resEmptyBody.body?.message === 'Request body cannot be empty'
    );

    // TEST 20: Additional fields such as title or description are rejected
    const resTitleExtra = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed', title: 'New Title' }, adminToken);
    const resDescExtra = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed', description: 'New Desc' }, adminToken);
    const isTest20Pass =
      resTitleExtra.status === 400 &&
      resDescExtra.status === 400 &&
      resTitleExtra.body?.message?.includes('title');
    record(
      'TEST 20: Additional fields such as title or description are rejected',
      '400 Bad Request with forbidden fields error',
      `Title extra: ${resTitleExtra.status}, Desc extra: ${resDescExtra.status}`,
      isTest20Pass
    );

    // TEST 21: Protected fields such as user_id and assigneeIds are rejected
    const resUserIdExtra = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed', user_id: 1 }, adminToken);
    const resAssigneeExtra = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed', assigneeIds: [user1.id] }, adminToken);
    const isTest21Pass =
      resUserIdExtra.status === 400 &&
      resAssigneeExtra.status === 400 &&
      resUserIdExtra.body?.message?.includes('user_id');
    record(
      'TEST 21: Protected fields such as user_id and assigneeIds are rejected',
      '400 Bad Request for user_id and assigneeIds',
      `user_id: ${resUserIdExtra.status}, assigneeIds: ${resAssigneeExtra.status}`,
      isTest21Pass
    );

    // TEST 22: Arbitrary unexpected fields are rejected
    const resArbitrary = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed', arbitraryKey: 'val', role: 'ADMIN' }, adminToken);
    record(
      'TEST 22: Arbitrary unexpected fields are rejected',
      '400 Bad Request for arbitrary properties',
      `Status: ${resArbitrary.status}, message: "${resArbitrary.body?.message}"`,
      resArbitrary.status === 400 && resArbitrary.body?.message?.includes('arbitraryKey')
    );

    // ==========================================
    // D. TASK ID VALIDATION
    // ==========================================

    // TEST 23: Non-numeric task ID returns HTTP 400
    const resNonNumericId = await patchTaskStatus('invalid-abc', { status: 'Completed' }, adminToken);
    record(
      'TEST 23: Non-numeric task ID returns HTTP 400',
      '400 Bad Request with "Invalid task ID"',
      `Status: ${resNonNumericId.status}, message: "${resNonNumericId.body?.message}"`,
      resNonNumericId.status === 400 && resNonNumericId.body?.message === 'Invalid task ID'
    );

    // TEST 24: Zero returns HTTP 400
    const resZeroId = await patchTaskStatus('0', { status: 'Completed' }, adminToken);
    record(
      'TEST 24: Zero returns HTTP 400',
      '400 Bad Request for task ID 0',
      `Status: ${resZeroId.status}, message: "${resZeroId.body?.message}"`,
      resZeroId.status === 400 && resZeroId.body?.message === 'Invalid task ID'
    );

    // TEST 25: Negative ID returns HTTP 400
    const resNegativeId = await patchTaskStatus('-1', { status: 'Completed' }, adminToken);
    record(
      'TEST 25: Negative ID returns HTTP 400',
      '400 Bad Request for negative task ID',
      `Status: ${resNegativeId.status}, message: "${resNegativeId.body?.message}"`,
      resNegativeId.status === 400 && resNegativeId.body?.message === 'Invalid task ID'
    );

    // TEST 26: Floating-point ID returns HTTP 400
    const resFloatId = await patchTaskStatus('2.5', { status: 'Completed' }, adminToken);
    record(
      'TEST 26: Floating-point ID returns HTTP 400',
      '400 Bad Request for floating point task ID',
      `Status: ${resFloatId.status}, message: "${resFloatId.body?.message}"`,
      resFloatId.status === 400 && resFloatId.body?.message === 'Invalid task ID'
    );

    // TEST 27: A valid but nonexistent task ID returns HTTP 404
    const resNonexistentId = await patchTaskStatus('999999', { status: 'Completed' }, adminToken);
    record(
      'TEST 27: A valid but nonexistent task ID returns HTTP 404',
      '404 Not Found with "Task not found"',
      `Status: ${resNonexistentId.status}, message: "${resNonexistentId.body?.message}"`,
      resNonexistentId.status === 404 && resNonexistentId.body?.message === 'Task not found'
    );

    // ==========================================
    // E. AUTHENTICATION AND SECURITY
    // ==========================================

    // TEST 28: Missing token returns HTTP 401
    const resNoToken = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed' }, null);
    record(
      'TEST 28: Missing token returns HTTP 401',
      '401 Unauthorized',
      `Status: ${resNoToken.status}, message: "${resNoToken.body?.message}"`,
      resNoToken.status === 401 && resNoToken.body?.success === false
    );

    // TEST 29: Invalid token returns HTTP 401
    const resInvalidToken = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed' }, 'invalid.tampered.token');
    record(
      'TEST 29: Invalid token returns HTTP 401',
      '401 Unauthorized',
      `Status: ${resInvalidToken.status}, message: "${resInvalidToken.body?.message}"`,
      resInvalidToken.status === 401 && resInvalidToken.body?.success === false
    );

    // TEST 30: Expired token returns HTTP 401 if reliably testable
    const expiredJwt = jwt.sign(
      { userId: adminUser.id, role: 'ADMIN' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const resExpiredToken = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed' }, expiredJwt);
    record(
      'TEST 30: Expired token returns HTTP 401',
      '401 Unauthorized with "Invalid or expired token"',
      `Status: ${resExpiredToken.status}, message: "${resExpiredToken.body?.message}"`,
      resExpiredToken.status === 401 && resExpiredToken.body?.success === false
    );

    // TEST 31: A successful status update does not alter title or description
    const resCheckFields = await patchTaskStatus(adminPersonalTask.id, { status: 'Completed' }, adminToken);
    const dbCheckFields = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest31Pass =
      resCheckFields.status === 200 &&
      dbCheckFields.title === adminPersonalTask.title &&
      dbCheckFields.description === adminPersonalTask.description;
    record(
      'TEST 31: A successful status update does not alter title or description',
      'Title and description in DB match initial fixture values',
      `Title match: ${dbCheckFields.title === adminPersonalTask.title}, Desc match: ${dbCheckFields.description === adminPersonalTask.description}`,
      isTest31Pass
    );

    // TEST 32: A successful status update does not alter creator identity
    const isTest32Pass =
      dbCheckFields.userId === adminUser.id &&
      resCheckFields.body?.data?.creator?.id === adminUser.id;
    record(
      'TEST 32: A successful status update does not alter creator identity',
      'Creator ID in DB and response matches initial creator',
      `DB userId: ${dbCheckFields.userId}, API creator id: ${resCheckFields.body?.data?.creator?.id}`,
      isTest32Pass
    );

    // TEST 33: A successful status update does not alter assignments
    const dbAssignmentsCheck = await prisma.taskAssignment.findMany({
      where: { taskId: teamTask.id },
      orderBy: { userId: 'asc' },
    });
    const isTest33Pass =
      dbAssignmentsCheck.length === 2 &&
      dbAssignmentsCheck[0].userId === user1.id &&
      dbAssignmentsCheck[1].userId === user2.id;
    record(
      'TEST 33: A successful status update does not alter assignments',
      'Task assignments count and user IDs in DB are completely unchanged',
      `Assignees: [${dbAssignmentsCheck.map((a) => a.userId).join(', ')}]`,
      isTest33Pass
    );

    // TEST 34: The response does not expose passwords or password hashes
    const jsonStr = JSON.stringify(resCheckFields.body);
    const hasPasswordLeak =
      jsonStr.toLowerCase().includes('password') ||
      jsonStr.includes('$2b$') ||
      jsonStr.toLowerCase().includes('secret');
    record(
      'TEST 34: The response does not expose passwords or password hashes',
      'Zero password or hash disclosures in API response',
      `Leak detected: ${hasPasswordLeak}`,
      !hasPasswordLeak && resCheckFields.status === 200
    );

    // TEST 35: Creator and assignee information contains only safe fields
    const taskData = resAdminTeamTask.body?.data;
    const creatorKeys = taskData?.creator ? Object.keys(taskData.creator).sort() : [];
    const expectedKeys = ['email', 'id', 'name', 'role'];
    const assigneeKeys = taskData?.assignments?.[0]?.user
      ? Object.keys(taskData.assignments[0].user).sort()
      : [];
    const isTest35Pass =
      JSON.stringify(creatorKeys) === JSON.stringify(expectedKeys) &&
      JSON.stringify(assigneeKeys) === JSON.stringify(expectedKeys);
    record(
      'TEST 35: Creator and assignee information contains only safe fields',
      'Strictly [email, id, name, role] on creator and assignee users',
      `Creator keys: [${creatorKeys}], Assignee keys: [${assigneeKeys}]`,
      isTest35Pass
    );

    // TEST 36: Invalid requests do not modify the task
    const dbBeforeInvalid = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    await patchTaskStatus(adminPersonalTask.id, { status: 'InvalidStatus' }, adminToken);
    await patchTaskStatus(adminPersonalTask.id, { status: 'Testing', title: 'Hacked Title' }, adminToken);
    await patchTaskStatus(adminPersonalTask.id, { status: 'Testing' }, user1Token); // forbidden user
    const dbAfterInvalid = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest36Pass =
      dbBeforeInvalid.status === dbAfterInvalid.status &&
      dbBeforeInvalid.title === dbAfterInvalid.title &&
      dbBeforeInvalid.updatedAt.getTime() === dbAfterInvalid.updatedAt.getTime();
    record(
      'TEST 36: Invalid requests do not modify the task',
      'DB task record remains identical after failed update attempts',
      `Status match: ${dbBeforeInvalid.status === dbAfterInvalid.status}, Timestamp match: true`,
      isTest36Pass
    );

    // TEST 37: The updated_at field follows existing Prisma behavior
    const prevTimestamp = dbAfterInvalid.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 20));
    const resTimestampUpdate = await patchTaskStatus(adminPersonalTask.id, { status: 'Pending' }, adminToken);
    const dbAfterTimestampUpdate = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest37Pass =
      resTimestampUpdate.status === 200 &&
      dbAfterTimestampUpdate.updatedAt.getTime() > prevTimestamp;
    record(
      'TEST 37: The updated_at field follows existing Prisma behavior',
      'updated_at timestamp is refreshed on successful update',
      `Prev: ${prevTimestamp}, New: ${dbAfterTimestampUpdate.updatedAt.getTime()}, Increased: ${dbAfterTimestampUpdate.updatedAt.getTime() > prevTimestamp}`,
      isTest37Pass
    );

    // Print summary report
    console.log('\n==================================================');
    console.log('STAGE 4E: PATCH /api/tasks/:id/status TEST RESULTS');
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

runUpdateTaskStatusTests();
