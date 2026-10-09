require('dotenv').config();
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const prisma = require('../config/prisma');

async function runUpdateTaskTests() {
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
        email: 'user2_patch_test@example.com',
        password: passwordHash,
        role: 'USER',
      },
    });
    createdUserIds.push(user2.id);

    // Create User 3 (unassigned user)
    const user3 = await prisma.user.create({
      data: {
        name: 'Test User Three (Unassigned)',
        email: 'user3_patch_test@example.com',
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
    const user2Token = await loginUser('user2_patch_test@example.com', 'TestPass@123');
    const user3Token = await loginUser('user3_patch_test@example.com', 'TestPass@123');

    // Helper function to call PATCH /api/tasks/:id
    const patchTask = async (id, payload, token, rawBody = null) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}/api/tasks/${id}`, {
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
    // Task 1: Personal task by user 1 (assignee: user 1)
    const user1PersonalTask = await prisma.task.create({
      data: {
        userId: user1.id,
        title: 'User 1 Personal Task Original',
        description: 'Original description by user 1',
        status: 'Pending',
        taskAssignments: {
          create: { userId: user1.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 2: Personal task by admin (assignee: admin)
    const adminPersonalTask = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Admin Personal Task Original',
        description: 'Original admin personal description',
        status: 'InProgress',
        taskAssignments: {
          create: { userId: adminUser.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 3: Team task by admin assigned to user 1 and user 2
    const teamTask1 = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Team Task 1 Original',
        description: 'Original team task description',
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
    const teamTask2 = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Team Task 2 for User 2 Only Original',
        description: 'Original team task description for user 2',
        status: 'Pending',
        taskAssignments: {
          create: { userId: user2.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    // Task 5: Personal task by user 2 (assignee: user 2)
    const user2PersonalTask = await prisma.task.create({
      data: {
        userId: user2.id,
        title: 'User 2 Personal Task Original',
        description: 'Original description by user 2',
        status: 'Completed',
        taskAssignments: {
          create: { userId: user2.id },
        },
      },
    });

    // ==========================================
    // A. ADMIN PERMISSIONS
    // ==========================================

    // TEST 1: Admin successfully updates a personal task
    const resAdminPersonal = await patchTask(adminPersonalTask.id, {
      title: 'Admin Personal Task Updated',
      description: 'Admin Personal Description Updated',
    }, adminToken);
    const dbAdminPersonal = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest1Pass =
      resAdminPersonal.status === 200 &&
      resAdminPersonal.body?.data?.title === 'Admin Personal Task Updated' &&
      resAdminPersonal.body?.data?.description === 'Admin Personal Description Updated' &&
      dbAdminPersonal.title === 'Admin Personal Task Updated';
    record(
      'TEST 1: Admin successfully updates a personal task',
      '200 OK with updated title and description in DB and response',
      `Status: ${resAdminPersonal.status}, title: "${dbAdminPersonal?.title}"`,
      isTest1Pass
    );

    // TEST 2: Admin successfully updates a regular user's personal task
    const resAdminUpdateUserTask = await patchTask(user2PersonalTask.id, {
      title: 'Admin Modified User 2 Task',
      description: 'Admin updated user 2 description',
    }, adminToken);
    const dbUser2Personal = await prisma.task.findUnique({ where: { id: user2PersonalTask.id } });
    const isTest2Pass =
      resAdminUpdateUserTask.status === 200 &&
      resAdminUpdateUserTask.body?.data?.title === 'Admin Modified User 2 Task' &&
      dbUser2Personal.title === 'Admin Modified User 2 Task';
    record(
      'TEST 2: Admin successfully updates a regular user\'s personal task',
      '200 OK and updated in DB',
      `Status: ${resAdminUpdateUserTask.status}, title: "${dbUser2Personal?.title}"`,
      isTest2Pass
    );

    // TEST 3: Admin successfully updates a team task
    const resAdminUpdateTeam = await patchTask(teamTask1.id, {
      title: 'Admin Modified Team Task 1',
      description: 'Admin modified team task description',
    }, adminToken);
    const dbTeamTask1 = await prisma.task.findUnique({ where: { id: teamTask1.id } });
    const isTest3Pass =
      resAdminUpdateTeam.status === 200 &&
      resAdminUpdateTeam.body?.data?.title === 'Admin Modified Team Task 1' &&
      dbTeamTask1.title === 'Admin Modified Team Task 1';
    record(
      'TEST 3: Admin successfully updates a team task',
      '200 OK and updated in DB',
      `Status: ${resAdminUpdateTeam.status}, title: "${dbTeamTask1?.title}"`,
      isTest3Pass
    );

    // TEST 4: Admin can update only the title
    const prevDescAdminTask = dbAdminPersonal.description;
    const resAdminTitleOnly = await patchTask(adminPersonalTask.id, {
      title: 'Admin Title Only Changed',
    }, adminToken);
    const dbAdminTitleOnly = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest4Pass =
      resAdminTitleOnly.status === 200 &&
      resAdminTitleOnly.body?.data?.title === 'Admin Title Only Changed' &&
      resAdminTitleOnly.body?.data?.description === prevDescAdminTask &&
      dbAdminTitleOnly.title === 'Admin Title Only Changed' &&
      dbAdminTitleOnly.description === prevDescAdminTask;
    record(
      'TEST 4: Admin can update only the title',
      '200 OK with title changed and description preserved',
      `Status: ${resAdminTitleOnly.status}, title: "${dbAdminTitleOnly?.title}", desc unchanged: ${dbAdminTitleOnly?.description === prevDescAdminTask}`,
      isTest4Pass
    );

    // TEST 5: Admin can update only the description
    const prevTitleAdminTask = dbAdminTitleOnly.title;
    const resAdminDescOnly = await patchTask(adminPersonalTask.id, {
      description: 'Admin Description Only Changed',
    }, adminToken);
    const dbAdminDescOnly = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest5Pass =
      resAdminDescOnly.status === 200 &&
      resAdminDescOnly.body?.data?.description === 'Admin Description Only Changed' &&
      resAdminDescOnly.body?.data?.title === prevTitleAdminTask &&
      dbAdminDescOnly.description === 'Admin Description Only Changed' &&
      dbAdminDescOnly.title === prevTitleAdminTask;
    record(
      'TEST 5: Admin can update only the description',
      '200 OK with description changed and title preserved',
      `Status: ${resAdminDescOnly.status}, desc: "${dbAdminDescOnly?.description}", title unchanged: ${dbAdminDescOnly?.title === prevTitleAdminTask}`,
      isTest5Pass
    );

    // TEST 6: Admin can update both editable fields
    const resAdminBoth = await patchTask(adminPersonalTask.id, {
      title: 'Admin Both Fields Title',
      description: 'Admin Both Fields Description',
    }, adminToken);
    const dbAdminBoth = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest6Pass =
      resAdminBoth.status === 200 &&
      dbAdminBoth.title === 'Admin Both Fields Title' &&
      dbAdminBoth.description === 'Admin Both Fields Description';
    record(
      'TEST 6: Admin can update both editable fields',
      '200 OK with both fields updated in DB',
      `Status: ${resAdminBoth.status}, title: "${dbAdminBoth?.title}", desc: "${dbAdminBoth?.description}"`,
      isTest6Pass
    );

    // TEST 7: Updated task details are returned correctly
    const updatedData = resAdminBoth.body?.data;
    const isTest7Pass =
      Boolean(updatedData) &&
      updatedData.id === adminPersonalTask.id &&
      updatedData.title === 'Admin Both Fields Title' &&
      updatedData.description === 'Admin Both Fields Description' &&
      (updatedData.status === 'InProgress' || updatedData.status === 'In Progress') &&
      Boolean(updatedData.created_at) &&
      Boolean(updatedData.updated_at) &&
      Boolean(updatedData.creator) &&
      updatedData.creator.id === adminUser.id &&
      Array.isArray(updatedData.assignments) &&
      updatedData.assignments.length === 1 &&
      updatedData.assignments[0].user_id === adminUser.id;
    record(
      'TEST 7: Updated task details are returned correctly',
      'Response has id, title, description, status, created_at, updated_at, creator, assignments',
      `id=${updatedData?.id}, status=${updatedData?.status}, creator=${updatedData?.creator?.email}`,
      isTest7Pass
    );

    // ==========================================
    // B. REGULAR-USER PERMISSIONS
    // ==========================================

    // TEST 8: User successfully updates their own personal task
    const resUser1UpdateOwn = await patchTask(user1PersonalTask.id, {
      title: 'User 1 Personal Task Modified',
      description: 'User 1 updated their own task description',
    }, user1Token);
    const dbUser1Own = await prisma.task.findUnique({ where: { id: user1PersonalTask.id } });
    const isTest8Pass =
      resUser1UpdateOwn.status === 200 &&
      resUser1UpdateOwn.body?.data?.title === 'User 1 Personal Task Modified' &&
      dbUser1Own.title === 'User 1 Personal Task Modified';
    record(
      'TEST 8: User successfully updates their own personal task',
      '200 OK and updated in DB',
      `Status: ${resUser1UpdateOwn.status}, title: "${dbUser1Own?.title}"`,
      isTest8Pass
    );

    // TEST 9: User cannot update another user's personal task
    const dbUser2Before9 = await prisma.task.findUnique({ where: { id: user2PersonalTask.id } });
    const resUser1UpdateOther = await patchTask(user2PersonalTask.id, {
      title: 'Hacked User 2 Task Title',
    }, user1Token);
    const dbUser2After9 = await prisma.task.findUnique({ where: { id: user2PersonalTask.id } });
    const isTest9Pass =
      resUser1UpdateOther.status === 404 &&
      resUser1UpdateOther.body?.message === 'Task not found' &&
      dbUser2Before9.title === dbUser2After9.title;
    record(
      'TEST 9: User cannot update another user\'s personal task',
      '404 Not Found (non-disclosing) and DB unchanged',
      `Status: ${resUser1UpdateOther.status}, message: "${resUser1UpdateOther.body?.message}"`,
      isTest9Pass
    );

    // TEST 10: User cannot update a team task assigned to them
    const dbTeam1Before10 = await prisma.task.findUnique({ where: { id: teamTask1.id } });
    const resUser1UpdateAssignedTeam = await patchTask(teamTask1.id, {
      title: 'Hacked Team Task 1 by Assignee',
    }, user1Token);
    const dbTeam1After10 = await prisma.task.findUnique({ where: { id: teamTask1.id } });
    const isTest10Pass =
      resUser1UpdateAssignedTeam.status === 404 &&
      resUser1UpdateAssignedTeam.body?.message === 'Task not found' &&
      dbTeam1Before10.title === dbTeam1After10.title;
    record(
      'TEST 10: User cannot update a team task assigned to them',
      '404 Not Found (non-disclosing) and DB unchanged',
      `Status: ${resUser1UpdateAssignedTeam.status}, message: "${resUser1UpdateAssignedTeam.body?.message}"`,
      isTest10Pass
    );

    // TEST 11: User cannot update a team task assigned to other users
    const dbTeam2Before11 = await prisma.task.findUnique({ where: { id: teamTask2.id } });
    const resUser1UpdateOtherTeam = await patchTask(teamTask2.id, {
      title: 'Hacked Team Task 2 by Unassigned User',
    }, user1Token);
    const dbTeam2After11 = await prisma.task.findUnique({ where: { id: teamTask2.id } });
    const isTest11Pass =
      resUser1UpdateOtherTeam.status === 404 &&
      resUser1UpdateOtherTeam.body?.message === 'Task not found' &&
      dbTeam2Before11.title === dbTeam2After11.title;
    record(
      'TEST 11: User cannot update a team task assigned to other users',
      '404 Not Found (non-disclosing) and DB unchanged',
      `Status: ${resUser1UpdateOtherTeam.status}, message: "${resUser1UpdateOtherTeam.body?.message}"`,
      isTest11Pass
    );

    // TEST 12: Unauthorized access uses the agreed non-disclosing 404 behavior
    const resNonexistentCheck = await patchTask(999999, { title: 'Nonexistent Task Update' }, adminToken);
    const isTest12Pass =
      resUser1UpdateOther.status === 404 &&
      resUser1UpdateAssignedTeam.status === 404 &&
      resUser1UpdateOtherTeam.status === 404 &&
      resNonexistentCheck.status === 404 &&
      resUser1UpdateOther.body?.message === resNonexistentCheck.body?.message &&
      resUser1UpdateAssignedTeam.body?.message === resNonexistentCheck.body?.message &&
      !('data' in resUser1UpdateOther.body);
    record(
      'TEST 12: Unauthorized access uses the agreed non-disclosing 404 behavior',
      'Identical 404 "Task not found" response concealing task existence and details',
      `User other: ${resUser1UpdateOther.body?.message}, Nonexistent: ${resNonexistentCheck.body?.message}`,
      isTest12Pass
    );

    // TEST 13: An unsuccessful update leaves the database record unchanged
    const isTest13Pass =
      dbUser2Before9.title === dbUser2After9.title &&
      dbUser2Before9.updatedAt.getTime() === dbUser2After9.updatedAt.getTime() &&
      dbTeam1Before10.title === dbTeam1After10.title &&
      dbTeam1Before10.updatedAt.getTime() === dbTeam1After10.updatedAt.getTime();
    record(
      'TEST 13: An unsuccessful update leaves the database record unchanged',
      'Database records for tasks 9 and 10 remain byte-for-byte unchanged',
      `User 2 task unchanged: ${dbUser2Before9.title === dbUser2After9.title}, Team 1 unchanged: ${dbTeam1Before10.title === dbTeam1After10.title}`,
      isTest13Pass
    );

    // ==========================================
    // C. PATCH VALIDATION
    // ==========================================

    // TEST 14: Empty request body returns HTTP 400
    const resEmptyBody = await patchTask(user1PersonalTask.id, {}, user1Token);
    record(
      'TEST 14: Empty request body returns HTTP 400',
      '400 Bad Request with "Request body cannot be empty"',
      `Status: ${resEmptyBody.status}, message: "${resEmptyBody.body?.message}"`,
      resEmptyBody.status === 400 && resEmptyBody.body?.success === false
    );

    // TEST 15: Missing editable fields returns HTTP 400
    const resNoEditable = await patchTask(user1PersonalTask.id, { nonEditableField: 'value' }, user1Token);
    record(
      'TEST 15: Missing editable fields returns HTTP 400',
      '400 Bad Request when no valid editable fields are provided',
      `Status: ${resNoEditable.status}, message: "${resNoEditable.body?.message}"`,
      resNoEditable.status === 400 && resNoEditable.body?.success === false
    );

    // TEST 16: Empty or whitespace-only title returns HTTP 400
    const resEmptyTitle = await patchTask(user1PersonalTask.id, { title: '' }, user1Token);
    const resWhitespaceTitle = await patchTask(user1PersonalTask.id, { title: '     ' }, user1Token);
    const isTest16Pass =
      resEmptyTitle.status === 400 &&
      resWhitespaceTitle.status === 400 &&
      resWhitespaceTitle.body?.message === 'Title cannot be empty or whitespace only';
    record(
      'TEST 16: Empty or whitespace-only title returns HTTP 400',
      '400 Bad Request for empty string or whitespace title',
      `Empty: ${resEmptyTitle.status}, Whitespace: ${resWhitespaceTitle.status}`,
      isTest16Pass
    );

    // TEST 17: Title exceeding 200 characters returns HTTP 400
    const longTitle = 'A'.repeat(201);
    const resLongTitle = await patchTask(user1PersonalTask.id, { title: longTitle }, user1Token);
    record(
      'TEST 17: Title exceeding 200 characters returns HTTP 400',
      '400 Bad Request with "Title cannot exceed 200 characters"',
      `Status: ${resLongTitle.status}, message: "${resLongTitle.body?.message}"`,
      resLongTitle.status === 400 && resLongTitle.body?.message === 'Title cannot exceed 200 characters'
    );

    // TEST 18: Non-string title returns HTTP 400
    const resNumberTitle = await patchTask(user1PersonalTask.id, { title: 12345 }, user1Token);
    const resBoolTitle = await patchTask(user1PersonalTask.id, { title: true }, user1Token);
    const isTest18Pass =
      resNumberTitle.status === 400 &&
      resBoolTitle.status === 400 &&
      resNumberTitle.body?.message === 'Title must be a string';
    record(
      'TEST 18: Non-string title returns HTTP 400',
      '400 Bad Request for number and boolean title types',
      `Number: ${resNumberTitle.status}, Bool: ${resBoolTitle.status}`,
      isTest18Pass
    );

    // TEST 19: Non-string description returns HTTP 400
    const resNumberDesc = await patchTask(user1PersonalTask.id, { description: 98765 }, user1Token);
    const resObjectDesc = await patchTask(user1PersonalTask.id, { description: { nested: 'val' } }, user1Token);
    const isTest19Pass =
      resNumberDesc.status === 400 &&
      resObjectDesc.status === 400 &&
      resNumberDesc.body?.message === 'Description must be a string';
    record(
      'TEST 19: Non-string description returns HTTP 400',
      '400 Bad Request for number and object description types',
      `Number: ${resNumberDesc.status}, Object: ${resObjectDesc.status}`,
      isTest19Pass
    );

    // TEST 20: Empty description follows the existing documented behavior
    const resEmptyDesc = await patchTask(user1PersonalTask.id, { description: '' }, user1Token);
    const dbEmptyDesc = await prisma.task.findUnique({ where: { id: user1PersonalTask.id } });
    const isTest20Pass =
      resEmptyDesc.status === 200 &&
      dbEmptyDesc.description === '';
    record(
      'TEST 20: Empty description follows existing documented behavior',
      '200 OK and description updated to empty string in DB',
      `Status: ${resEmptyDesc.status}, DB desc: "${dbEmptyDesc?.description}"`,
      isTest20Pass
    );

    // TEST 21: Invalid task ID returns HTTP 400
    const resInvalidIdStr = await patchTask('not-a-number', { title: 'Valid Title' }, adminToken);
    const resNegativeId = await patchTask('-10', { title: 'Valid Title' }, adminToken);
    const resZeroId = await patchTask('0', { title: 'Valid Title' }, adminToken);
    const resFloatId = await patchTask('2.7', { title: 'Valid Title' }, adminToken);
    const isTest21Pass =
      resInvalidIdStr.status === 400 &&
      resNegativeId.status === 400 &&
      resZeroId.status === 400 &&
      resFloatId.status === 400 &&
      resInvalidIdStr.body?.message === 'Invalid task ID';
    record(
      'TEST 21: Invalid task ID returns HTTP 400',
      '400 Bad Request for non-integer, negative, zero, and float IDs',
      `String: ${resInvalidIdStr.status}, Negative: ${resNegativeId.status}, Zero: ${resZeroId.status}, Float: ${resFloatId.status}`,
      isTest21Pass
    );

    // TEST 22: Nonexistent task ID returns HTTP 404
    const resNonexistentId = await patchTask(999999, { title: 'Nonexistent ID Title' }, adminToken);
    record(
      'TEST 22: Nonexistent task ID returns HTTP 404',
      '404 Not Found with "Task not found"',
      `Status: ${resNonexistentId.status}, message: "${resNonexistentId.body?.message}"`,
      resNonexistentId.status === 404 && resNonexistentId.body?.message === 'Task not found'
    );

    // TEST 23: Malformed JSON is handled safely if supported by the existing test setup
    const resMalformedJson = await patchTask(user1PersonalTask.id, null, user1Token, '{ "title": "unclosed json ');
    record(
      'TEST 23: Malformed JSON is handled safely',
      '400 Bad Request without server crash',
      `Status: ${resMalformedJson.status}`,
      resMalformedJson.status === 400
    );

    // ==========================================
    // D. MASS-ASSIGNMENT AND SECURITY
    // ==========================================

    // TEST 24: A USER cannot change status through this endpoint
    const resUserStatus = await patchTask(user1PersonalTask.id, {
      title: 'Valid Title',
      status: 'Completed',
    }, user1Token);
    const dbStatusCheck24 = await prisma.task.findUnique({ where: { id: user1PersonalTask.id } });
    const isTest24Pass =
      resUserStatus.status === 400 &&
      dbStatusCheck24.status === 'Pending';
    record(
      'TEST 24: A USER cannot change status through this endpoint',
      '400 Bad Request and DB status unchanged',
      `Status: ${resUserStatus.status}, message: "${resUserStatus.body?.message}", DB status: "${dbStatusCheck24?.status}"`,
      isTest24Pass
    );

    // TEST 25: An ADMIN cannot change status through this endpoint
    const resAdminStatus = await patchTask(adminPersonalTask.id, {
      title: 'Admin Title',
      status: 'Completed',
    }, adminToken);
    const dbStatusCheck25 = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest25Pass =
      resAdminStatus.status === 400 &&
      dbStatusCheck25.status === 'InProgress';
    record(
      'TEST 25: An ADMIN cannot change status through this endpoint',
      '400 Bad Request and DB status unchanged',
      `Status: ${resAdminStatus.status}, message: "${resAdminStatus.body?.message}", DB status: "${dbStatusCheck25?.status}"`,
      isTest25Pass
    );

    // TEST 26: Neither role can change creator identity
    const resSpoofUser = await patchTask(user1PersonalTask.id, {
      title: 'Valid Title',
      user_id: adminUser.id,
    }, user1Token);
    const resSpoofAdmin = await patchTask(adminPersonalTask.id, {
      title: 'Valid Title',
      userId: user1.id,
    }, adminToken);
    const dbCreatorCheckUser = await prisma.task.findUnique({ where: { id: user1PersonalTask.id } });
    const dbCreatorCheckAdmin = await prisma.task.findUnique({ where: { id: adminPersonalTask.id } });
    const isTest26Pass =
      resSpoofUser.status === 400 &&
      resSpoofAdmin.status === 400 &&
      dbCreatorCheckUser.userId === user1.id &&
      dbCreatorCheckAdmin.userId === adminUser.id;
    record(
      'TEST 26: Neither role can change creator identity',
      '400 Bad Request and DB creator unchanged for both USER and ADMIN',
      `User spoof status: ${resSpoofUser.status}, Admin spoof status: ${resSpoofAdmin.status}`,
      isTest26Pass
    );

    // TEST 27: Neither role can change assignments through this endpoint
    const resAssigneeUser = await patchTask(user1PersonalTask.id, {
      title: 'Valid Title',
      assigneeIds: [user2.id],
    }, user1Token);
    const resAssigneeAdmin = await patchTask(teamTask1.id, {
      title: 'Valid Title',
      assignmentType: 'PERSONAL',
    }, adminToken);
    const isTest27Pass =
      resAssigneeUser.status === 400 &&
      resAssigneeAdmin.status === 400;
    record(
      'TEST 27: Neither role can change assignments through this endpoint',
      '400 Bad Request for assigneeIds and assignmentType in PATCH',
      `User assignee status: ${resAssigneeUser.status}, Admin assignmentType status: ${resAssigneeAdmin.status}`,
      isTest27Pass
    );

    // TEST 28: Neither role can change task ID or timestamps through request-body fields
    const resIdTamper = await patchTask(user1PersonalTask.id, { title: 'Valid Title', id: 9999 }, user1Token);
    const resCreatedAtTamper = await patchTask(user1PersonalTask.id, { title: 'Valid Title', created_at: '2020-01-01T00:00:00Z' }, user1Token);
    const resUpdatedAtTamper = await patchTask(user1PersonalTask.id, { title: 'Valid Title', updated_at: '2020-01-01T00:00:00Z' }, user1Token);
    const isTest28Pass =
      resIdTamper.status === 400 &&
      resCreatedAtTamper.status === 400 &&
      resUpdatedAtTamper.status === 400;
    record(
      'TEST 28: Neither role can change task ID or timestamps through request-body fields',
      '400 Bad Request for id, created_at, and updated_at',
      `id: ${resIdTamper.status}, created_at: ${resCreatedAtTamper.status}, updated_at: ${resUpdatedAtTamper.status}`,
      isTest28Pass
    );

    // TEST 29: Arbitrary unexpected fields are rejected or safely handled according to the explicit allowlist policy
    const resArbitrary = await patchTask(user1PersonalTask.id, {
      title: 'Valid Title',
      arbitraryProp: 'injectedValue',
      isAdmin: true,
    }, user1Token);
    record(
      'TEST 29: Arbitrary unexpected fields rejected according to explicit allowlist policy',
      '400 Bad Request with forbidden fields error message',
      `Status: ${resArbitrary.status}, message: "${resArbitrary.body?.message}"`,
      resArbitrary.status === 400 && resArbitrary.body?.message?.includes('arbitraryProp')
    );

    // TEST 30: The response contains no password hashes or secrets
    const resCleanCheck = await patchTask(user1PersonalTask.id, { title: 'Clean Security Check' }, user1Token);
    const jsonStr = JSON.stringify(resCleanCheck.body);
    const hasPasswordLeak =
      jsonStr.toLowerCase().includes('password') ||
      jsonStr.includes('$2b$') ||
      jsonStr.toLowerCase().includes('secret');
    record(
      'TEST 30: The response contains no password hashes or secrets',
      'Strictly zero password or bcrypt hash disclosures in JSON response',
      `Leak detected: ${hasPasswordLeak}`,
      !hasPasswordLeak && resCleanCheck.status === 200
    );

    // TEST 31: Assignment and creator information remain correct after updating
    const resTeamUpdate = await patchTask(teamTask1.id, { title: 'Team Task Integrity Check' }, adminToken);
    const teamData = resTeamUpdate.body?.data;
    const isTest31Pass =
      resTeamUpdate.status === 200 &&
      teamData?.creator?.id === adminUser.id &&
      teamData?.creator?.role === 'ADMIN' &&
      Array.isArray(teamData?.assignments) &&
      teamData.assignments.length === 2 &&
      teamData.assignments[0].user?.role === 'USER' &&
      teamData.assignments[1].user?.role === 'USER';
    record(
      'TEST 31: Assignment and creator information remain correct after updating',
      'Creator and assignees intact with role and user profile fields',
      `Creator: ${teamData?.creator?.email}, Assignees: ${teamData?.assignments?.length}`,
      isTest31Pass
    );

    // TEST 32: The update does not alter task assignments
    const dbAssignmentsTeam1 = await prisma.taskAssignment.findMany({
      where: { taskId: teamTask1.id },
      orderBy: { userId: 'asc' },
    });
    const assigneeIds = dbAssignmentsTeam1.map((a) => a.userId);
    const isTest32Pass =
      dbAssignmentsTeam1.length === 2 &&
      assigneeIds[0] === user1.id &&
      assigneeIds[1] === user2.id;
    record(
      'TEST 32: The update does not alter task assignments',
      'Task assignments in database are completely preserved',
      `Assignee IDs: [${assigneeIds.join(', ')}]`,
      isTest32Pass
    );

    // TEST 33: Missing JWT returns HTTP 401
    const resMissingJwt = await patchTask(user1PersonalTask.id, { title: 'No Token Update' }, null);
    record(
      'TEST 33: Missing JWT returns HTTP 401',
      '401 Unauthorized with "Authorization token required"',
      `Status: ${resMissingJwt.status}, message: "${resMissingJwt.body?.message}"`,
      resMissingJwt.status === 401 && resMissingJwt.body?.success === false
    );

    // TEST 34: Invalid JWT returns HTTP 401
    const resInvalidJwt = await patchTask(user1PersonalTask.id, { title: 'Invalid Token Update' }, 'invalid.tampered.jwt');
    record(
      'TEST 34: Invalid JWT returns HTTP 401',
      '401 Unauthorized with "Invalid or expired token"',
      `Status: ${resInvalidJwt.status}, message: "${resInvalidJwt.body?.message}"`,
      resInvalidJwt.status === 401 && resInvalidJwt.body?.success === false
    );

    // TEST 35: Expired JWT returns HTTP 401 if reliably testable
    const expiredJwt = jwt.sign(
      { userId: user1.id, role: 'USER' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const resExpiredJwt = await patchTask(user1PersonalTask.id, { title: 'Expired Token Update' }, expiredJwt);
    record(
      'TEST 35: Expired JWT returns HTTP 401 if reliably testable',
      '401 Unauthorized with "Invalid or expired token"',
      `Status: ${resExpiredJwt.status}, message: "${resExpiredJwt.body?.message}"`,
      resExpiredJwt.status === 401 && resExpiredJwt.body?.success === false
    );

    // Print summary report
    console.log('\n==================================================');
    console.log('STAGE 4D: PATCH /api/tasks/:id TEST RESULTS');
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

runUpdateTaskTests();
