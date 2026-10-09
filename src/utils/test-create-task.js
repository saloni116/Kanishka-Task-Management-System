require('dotenv').config();
const http = require('http');
const bcrypt = require('bcrypt');
const app = require('../app');
const prisma = require('../config/prisma');

async function runCreateTaskTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const testResults = [];
  let tempUserId = null;

  function record(test, expected, actual, passed) {
    testResults.push({
      test,
      expected,
      actual,
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  try {
    // 0. Setup: Clean up any pre-existing non-seed tasks/users
    await prisma.taskAssignment.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          notIn: ['admin@example.com', 'user@example.com'],
        },
      },
    });

    // Obtain Admin & Regular User from database
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    const regularUser = await prisma.user.findUnique({ where: { email: 'user@example.com' } });

    if (!adminUser || !regularUser) {
      throw new Error('Seed users admin@example.com and user@example.com must exist before testing.');
    }

    // Create a second regular user for TEAM task testing
    const hashedPassword = await bcrypt.hash('User2@123', 10);
    const tempUser = await prisma.user.create({
      data: {
        name: 'Second Test User',
        email: 'user2_temp@example.com',
        password: hashedPassword,
        role: 'USER',
      },
    });
    tempUserId = tempUser.id;

    // Login Admin
    const resLoginAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Admin@123' }),
    });
    const bodyLoginAdmin = await resLoginAdmin.json();
    const adminToken = bodyLoginAdmin?.data?.token;

    // Login Regular User
    const resLoginUser = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'User@123' }),
    });
    const bodyLoginUser = await resLoginUser.json();
    const userToken = bodyLoginUser?.data?.token;

    // ==========================================
    // PERSONAL TASKS
    // ==========================================

    // TEST 1: USER creates a personal task
    const res1 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: 'Complete database assignment',
        description: 'Finish the SQL queries',
      }),
    });
    const body1 = await res1.json();
    const task1 = body1?.data;
    const isTest1Pass =
      res1.status === 201 &&
      task1?.user_id === regularUser.id &&
      task1?.status === 'Pending' &&
      Array.isArray(task1?.assignments) &&
      task1.assignments.length === 1 &&
      task1.assignments[0].user_id === regularUser.id;
    record(
      'TEST 1: USER creates a personal task',
      '201 Created. Creator is USER. Assignment belongs to USER. Status is Pending.',
      `Status: ${res1.status}, creator: ${task1?.user_id}, status: "${task1?.status}", assignments: ${JSON.stringify(task1?.assignments)}`,
      isTest1Pass
    );

    // TEST 2: ADMIN creates a personal task without assignmentType
    const res2 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Review project architecture',
        description: 'Review backend routes and schema',
      }),
    });
    const body2 = await res2.json();
    const task2 = body2?.data;
    const isTest2Pass =
      res2.status === 201 &&
      task2?.user_id === adminUser.id &&
      task2?.status === 'Pending' &&
      Array.isArray(task2?.assignments) &&
      task2.assignments.length === 1 &&
      task2.assignments[0].user_id === adminUser.id;
    record(
      'TEST 2: ADMIN creates a personal task without assignmentType',
      '201 Created. Defaults to PERSONAL. Creator and assignee are ADMIN.',
      `Status: ${res2.status}, creator: ${task2?.user_id}, assignee: ${task2?.assignments?.[0]?.user_id}`,
      isTest2Pass
    );

    // TEST 3: ADMIN creates a personal task with assignmentType PERSONAL
    const res3 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Review security audit',
        description: 'Check password hashing and JWT secret',
        assignmentType: 'PERSONAL',
      }),
    });
    const body3 = await res3.json();
    const task3 = body3?.data;
    const isTest3Pass =
      res3.status === 201 &&
      task3?.user_id === adminUser.id &&
      Array.isArray(task3?.assignments) &&
      task3.assignments.length === 1 &&
      task3.assignments[0].user_id === adminUser.id;
    record(
      'TEST 3: ADMIN creates a personal task with assignmentType PERSONAL',
      '201 Created. Exactly one assignment for the ADMIN.',
      `Status: ${res3.status}, assignments count: ${task3?.assignments?.length}, assignee: ${task3?.assignments?.[0]?.user_id}`,
      isTest3Pass
    );

    // ==========================================
    // TEAM TASKS
    // ==========================================

    // TEST 4: ADMIN creates a team task for two valid regular users
    const res4 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Implement authentication testing',
        description: 'Test login and authorization',
        assignmentType: 'TEAM',
        assigneeIds: [regularUser.id, tempUser.id],
      }),
    });
    const body4 = await res4.json();
    const task4 = body4?.data;
    const task4AssigneeIds = task4?.assignments?.map((a) => a.user_id).sort((a, b) => a - b);
    const expectedAssigneeIds = [regularUser.id, tempUser.id].sort((a, b) => a - b);
    const isTest4Pass =
      res4.status === 201 &&
      task4?.user_id === adminUser.id &&
      Array.isArray(task4?.assignments) &&
      task4.assignments.length === 2 &&
      JSON.stringify(task4AssigneeIds) === JSON.stringify(expectedAssigneeIds);
    record(
      'TEST 4: ADMIN creates a team task for two valid regular users',
      '201 Created. One task record. Two assignment records. Creator is ADMIN.',
      `Status: ${res4.status}, creator: ${task4?.user_id}, assignees: [${task4AssigneeIds}]`,
      isTest4Pass
    );

    // TEST 5: USER attempts TEAM creation
    const tasksCountBefore5 = await prisma.task.count();
    const res5 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: 'Unauthorized team task',
        description: 'Regular user trying to create team task',
        assignmentType: 'TEAM',
        assigneeIds: [tempUser.id],
      }),
    });
    const body5 = await res5.json();
    const tasksCountAfter5 = await prisma.task.count();
    const isTest5Pass =
      res5.status === 403 &&
      body5.success === false &&
      tasksCountBefore5 === tasksCountAfter5;
    record(
      'TEST 5: USER attempts TEAM creation',
      '403 Forbidden. No task or assignment created.',
      `Status: ${res5.status}, message: "${body5.message}", task count diff: ${tasksCountAfter5 - tasksCountBefore5}`,
      isTest5Pass
    );

    // TEST 6: ADMIN assigns a team task to an ADMIN account
    const tasksCountBefore6 = await prisma.task.count();
    const res6 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Team task assigned to admin',
        description: 'Should fail because assignee is admin',
        assignmentType: 'TEAM',
        assigneeIds: [adminUser.id],
      }),
    });
    const body6 = await res6.json();
    const tasksCountAfter6 = await prisma.task.count();
    const isTest6Pass =
      res6.status === 400 &&
      body6.success === false &&
      tasksCountBefore6 === tasksCountAfter6;
    record(
      'TEST 6: ADMIN assigns a team task to an ADMIN account',
      '400 Bad Request. No task or assignments created.',
      `Status: ${res6.status}, message: "${body6.message}", task count diff: ${tasksCountAfter6 - tasksCountBefore6}`,
      isTest6Pass
    );

    // TEST 7: ADMIN supplies a nonexistent assignee ID
    const tasksCountBefore7 = await prisma.task.count();
    const res7 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Team task with nonexistent user',
        description: 'Assignee does not exist',
        assignmentType: 'TEAM',
        assigneeIds: [999999],
      }),
    });
    const body7 = await res7.json();
    const tasksCountAfter7 = await prisma.task.count();
    const isTest7Pass =
      res7.status === 400 &&
      body7.success === false &&
      tasksCountBefore7 === tasksCountAfter7;
    record(
      'TEST 7: ADMIN supplies a nonexistent assignee ID',
      '400 Bad Request. No task or assignments created.',
      `Status: ${res7.status}, message: "${body7.message}", task count diff: ${tasksCountAfter7 - tasksCountBefore7}`,
      isTest7Pass
    );

    // TEST 8: ADMIN supplies duplicate assignee IDs
    const tasksCountBefore8 = await prisma.task.count();
    const res8 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Team task with duplicate assignees',
        description: 'Duplicate IDs in array',
        assignmentType: 'TEAM',
        assigneeIds: [regularUser.id, regularUser.id],
      }),
    });
    const body8 = await res8.json();
    const tasksCountAfter8 = await prisma.task.count();
    const isTest8Pass =
      res8.status === 400 &&
      body8.success === false &&
      tasksCountBefore8 === tasksCountAfter8;
    record(
      'TEST 8: ADMIN supplies duplicate assignee IDs',
      '400 Bad Request. No task or assignments created.',
      `Status: ${res8.status}, message: "${body8.message}", task count diff: ${tasksCountAfter8 - tasksCountBefore8}`,
      isTest8Pass
    );

    // ==========================================
    // VALIDATION
    // ==========================================

    // TEST 9: Missing title
    const res9 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        description: 'Missing title field',
      }),
    });
    const body9 = await res9.json();
    record(
      'TEST 9: Missing title',
      '400 Bad Request',
      `Status: ${res9.status}, message: "${body9.message}"`,
      res9.status === 400 && body9.success === false
    );

    // TEST 10: Title is an empty string or whitespace only
    const res10 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: '    ',
        description: 'Whitespace title',
      }),
    });
    const body10 = await res10.json();
    record(
      'TEST 10: Title is an empty string or whitespace only',
      '400 Bad Request',
      `Status: ${res10.status}, message: "${body10.message}"`,
      res10.status === 400 && body10.success === false
    );

    // TEST 11: Title is not a string
    const res11 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: 12345,
        description: 'Numeric title',
      }),
    });
    const body11 = await res11.json();
    record(
      'TEST 11: Title is not a string',
      '400 Bad Request',
      `Status: ${res11.status}, message: "${body11.message}"`,
      res11.status === 400 && body11.success === false
    );

    // TEST 12: Title exceeds the documented maximum length (> 200)
    const longTitle = 'T'.repeat(201);
    const res12 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: longTitle,
        description: 'Exceeding 200 chars',
      }),
    });
    const body12 = await res12.json();
    record(
      'TEST 12: Title exceeds the documented maximum length',
      '400 Bad Request',
      `Status: ${res12.status}, message: "${body12.message}"`,
      res12.status === 400 && body12.success === false
    );

    // TEST 13: Invalid assignmentType
    const res13 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid assignment type test',
        assignmentType: 'INVALID_TYPE',
      }),
    });
    const body13 = await res13.json();
    record(
      'TEST 13: Invalid assignmentType',
      '400 Bad Request',
      `Status: ${res13.status}, message: "${body13.message}"`,
      res13.status === 400 && body13.success === false
    );

    // TEST 14: TEAM request missing assigneeIds
    const res14 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Team task missing assigneeIds',
        assignmentType: 'TEAM',
      }),
    });
    const body14 = await res14.json();
    record(
      'TEST 14: TEAM request missing assigneeIds',
      '400 Bad Request',
      `Status: ${res14.status}, message: "${body14.message}"`,
      res14.status === 400 && body14.success === false
    );

    // TEST 15: TEAM request with an empty assigneeIds array
    const res15 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Team task empty assigneeIds',
        assignmentType: 'TEAM',
        assigneeIds: [],
      }),
    });
    const body15 = await res15.json();
    record(
      'TEST 15: TEAM request with an empty assigneeIds array',
      '400 Bad Request',
      `Status: ${res15.status}, message: "${body15.message}"`,
      res15.status === 400 && body15.success === false
    );

    // TEST 16: Invalid assignee ID type, such as a string or negative number
    const res16String = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Team task string assignee ID',
        assignmentType: 'TEAM',
        assigneeIds: ['two'],
      }),
    });
    const body16String = await res16String.json();

    const res16Negative = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Team task negative assignee ID',
        assignmentType: 'TEAM',
        assigneeIds: [-2],
      }),
    });
    const body16Negative = await res16Negative.json();

    const isTest16Pass =
      res16String.status === 400 &&
      body16String.success === false &&
      res16Negative.status === 400 &&
      body16Negative.success === false;
    record(
      'TEST 16: Invalid assignee ID type, such as a string or negative number',
      '400 Bad Request for both string and negative integer IDs',
      `String ID status: ${res16String.status}, Negative ID status: ${res16Negative.status}`,
      isTest16Pass
    );

    // TEST 17: PERSONAL task request includes assigneeIds
    const res17 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: 'Personal task with unexpected assignees',
        assignmentType: 'PERSONAL',
        assigneeIds: [tempUser.id],
      }),
    });
    const body17 = await res17.json();
    record(
      'TEST 17: PERSONAL task request includes assigneeIds',
      '400 Bad Request',
      `Status: ${res17.status}, message: "${body17.message}"`,
      res17.status === 400 && body17.success === false
    );

    // ==========================================
    // SECURITY
    // ==========================================

    // TEST 18: No JWT
    const res18 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Unauthenticated task',
      }),
    });
    const body18 = await res18.json();
    record(
      'TEST 18: No JWT',
      '401 Unauthorized',
      `Status: ${res18.status}, message: "${body18.message}"`,
      res18.status === 401 && body18.success === false
    );

    // TEST 19: Invalid JWT
    const res19 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.tampered.token',
      },
      body: JSON.stringify({
        title: 'Invalid token task',
      }),
    });
    const body19 = await res19.json();
    record(
      'TEST 19: Invalid JWT',
      '401 Unauthorized',
      `Status: ${res19.status}, message: "${body19.message}"`,
      res19.status === 401 && body19.success === false
    );

    // TEST 20: USER attempts to send a creator ID belonging to ADMIN
    const res20 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: 'Creator spoofing attempt',
        user_id: adminUser.id,
        userId: adminUser.id,
        creatorId: adminUser.id,
      }),
    });
    const body20 = await res20.json();
    const task20 = body20?.data;
    const task20InDb = task20?.id
      ? await prisma.task.findUnique({ where: { id: task20.id } })
      : null;
    const isTest20Pass =
      res20.status === 201 &&
      task20?.user_id === regularUser.id &&
      task20InDb?.userId === regularUser.id;
    record(
      'TEST 20: USER attempts to send a creator ID belonging to ADMIN',
      'Creator ID cannot be overridden; task creator is authenticated USER.',
      `Status: ${res20.status}, API user_id: ${task20?.user_id}, DB userId: ${task20InDb?.userId}`,
      isTest20Pass
    );

    // TEST 21: USER attempts to supply role ADMIN in the request body
    const res21 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        title: 'Role spoofing attempt for team task',
        role: 'ADMIN',
        assignmentType: 'TEAM',
        assigneeIds: [tempUser.id],
      }),
    });
    const body21 = await res21.json();
    record(
      'TEST 21: USER attempts to supply role ADMIN in the request body',
      'Role in body is ignored; user remains USER and receives 403 Forbidden',
      `Status: ${res21.status}, message: "${body21.message}"`,
      res21.status === 403 && body21.success === false
    );

    // TEST 22: Check the response and database records for password/hash leakage
    const responseString = JSON.stringify(body1);
    const hasPasswordInResponse =
      responseString.toLowerCase().includes('password') ||
      responseString.toLowerCase().includes('$2b$');
    const createdTaskInDb = await prisma.task.findUnique({
      where: { id: task1.id },
      include: {
        creator: true,
        taskAssignments: { include: { user: true } },
      },
    });
    record(
      'TEST 22: Check response and database records for password/hash leakage',
      'No password or password hash is returned in response',
      `Response has password: ${hasPasswordInResponse}`,
      !hasPasswordInResponse && Boolean(createdTaskInDb)
    );

    // ==========================================
    // DATABASE ATOMICITY
    // ==========================================

    // TEST 23: Submit a TEAM task with multiple assignees, including one invalid ID
    const countTasksBefore23 = await prisma.task.count();
    const countAssignmentsBefore23 = await prisma.taskAssignment.count();

    const res23 = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Atomic rollback test task',
        description: 'Contains valid user and invalid user',
        assignmentType: 'TEAM',
        assigneeIds: [regularUser.id, 999999],
      }),
    });
    const body23 = await res23.json();

    const countTasksAfter23 = await prisma.task.count();
    const countAssignmentsAfter23 = await prisma.taskAssignment.count();
    const isTest23Pass =
      res23.status === 400 &&
      body23.success === false &&
      countTasksBefore23 === countTasksAfter23 &&
      countAssignmentsBefore23 === countAssignmentsAfter23;
    record(
      'TEST 23: Submit a TEAM task with multiple assignees, including one invalid ID',
      '400 Bad Request. No task record created. No assignment records created.',
      `Status: ${res23.status}, tasks diff: ${countTasksAfter23 - countTasksBefore23}, assignments diff: ${countAssignmentsAfter23 - countAssignmentsBefore23}`,
      isTest23Pass
    );

    // TEST 24: Verify task and assignment records match the request exactly after successful creation
    const dbTask4 = await prisma.task.findUnique({
      where: { id: task4.id },
      include: {
        taskAssignments: {
          orderBy: { userId: 'asc' },
        },
      },
    });
    const dbTask4Assignees = dbTask4?.taskAssignments.map((a) => a.userId);
    const isTest24Pass =
      dbTask4 !== null &&
      dbTask4.title === 'Implement authentication testing' &&
      dbTask4.description === 'Test login and authorization' &&
      dbTask4.status === 'Pending' &&
      dbTask4.userId === adminUser.id &&
      JSON.stringify(dbTask4Assignees) === JSON.stringify(expectedAssigneeIds);
    record(
      'TEST 24: Verify task and assignment records match the request exactly after successful creation',
      'Database records match request title, description, status, creator, and assignees',
      `DB Task: title="${dbTask4?.title}", status="${dbTask4?.status}", creator=${dbTask4?.userId}, assignees=[${dbTask4Assignees}]`,
      isTest24Pass
    );

    // ==========================================
    // CLEANUP & RECOVERY
    // ==========================================

    // TEST 25: Verify test cleanup removes all test-created tasks and their assignment rows without removing seed users
    await prisma.taskAssignment.deleteMany({});
    await prisma.task.deleteMany({});
    if (tempUserId) {
      await prisma.user.delete({ where: { id: tempUserId } });
      tempUserId = null;
    }

    const finalTaskCount = await prisma.task.count();
    const finalAssignmentCount = await prisma.taskAssignment.count();
    const finalAllUsers = await prisma.user.findMany();
    const finalAdmin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    const finalRegularUser = await prisma.user.findUnique({ where: { email: 'user@example.com' } });

    const isTest25Pass =
      finalTaskCount === 0 &&
      finalAssignmentCount === 0 &&
      finalAllUsers.length === 2 &&
      Boolean(finalAdmin) &&
      Boolean(finalRegularUser);

    record(
      'TEST 25: Verify test cleanup removes all test-created tasks and their assignment rows without removing seed users',
      'Tasks=0, Assignments=0, Users=2 (admin@example.com, user@example.com intact)',
      `tasks: ${finalTaskCount}, assignments: ${finalAssignmentCount}, users: ${finalAllUsers.length}`,
      isTest25Pass
    );

    // Print summary report
    console.log('\n==================================================');
    console.log('STAGE 4A: CREATE TASK API TEST RESULTS');
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
      await prisma.taskAssignment.deleteMany({});
      await prisma.task.deleteMany({});
      if (tempUserId) {
        await prisma.user.delete({ where: { id: tempUserId } });
      }
    } catch (_) {}
    server.close();
    await prisma.$disconnect();
  }
}

runCreateTaskTests();
