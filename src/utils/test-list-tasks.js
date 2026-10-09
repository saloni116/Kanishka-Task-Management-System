require('dotenv').config();
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const prisma = require('../config/prisma');

async function runListTasksTests() {
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
    const userPasswordHash = await bcrypt.hash('TestPass@123', 10);
    const user2 = await prisma.user.create({
      data: {
        name: 'Test User Two',
        email: 'user2_list_test@example.com',
        password: userPasswordHash,
        role: 'USER',
      },
    });
    createdUserIds.push(user2.id);

    // Create User 3 (user with zero tasks)
    const user3 = await prisma.user.create({
      data: {
        name: 'Test User Three (Empty)',
        email: 'user3_empty_test@example.com',
        password: userPasswordHash,
        role: 'USER',
      },
    });
    createdUserIds.push(user3.id);

    // Obtain tokens
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
    const user2Token = await loginUser('user2_list_test@example.com', 'TestPass@123');
    const user3Token = await loginUser('user3_empty_test@example.com', 'TestPass@123');

    // Create Test Fixture Tasks:
    // Task 1: Personal task by user 1 (assignee: user 1)
    const task1 = await prisma.task.create({
      data: {
        userId: user1.id,
        title: 'Task 1: User 1 Personal Task',
        description: 'Created by User 1 for User 1',
        status: 'Pending',
        taskAssignments: {
          create: { userId: user1.id },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 20)); // Stagger timestamps slightly

    // Task 2: Personal task by admin (assignee: admin)
    const task2 = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Task 2: Admin Personal Task',
        description: 'Created by Admin for Admin',
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
        title: 'Task 3: Admin Team Task (Users 1 & 2)',
        description: 'Assigned to User 1 and User 2',
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

    // Task 4: Team task by admin assigned exclusively to user 2
    const task4 = await prisma.task.create({
      data: {
        userId: adminUser.id,
        title: 'Task 4: Admin Team Task (User 2 Only)',
        description: 'Assigned solely to User 2',
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
        description: 'Created by User 2 for User 2',
        status: 'Completed',
        taskAssignments: {
          create: { userId: user2.id },
        },
      },
    });

    // Helper to call GET /api/tasks
    const fetchTasks = async (token) => {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${baseUrl}/api/tasks`, { headers });
      const body = await res.json();
      return { status: res.status, body };
    };

    // ==========================================
    // A. ADMIN VISIBILITY
    // ==========================================

    const adminGet = await fetchTasks(adminToken);
    const adminTasks = adminGet.body?.data || [];
    const adminTaskIds = adminTasks.map((t) => t.id);

    // TEST 1: Admin can retrieve the task list
    record(
      'TEST 1: Admin can retrieve the task list',
      '200 OK with success: true and an array of tasks',
      `Status: ${adminGet.status}, count: ${adminTasks.length}`,
      adminGet.status === 200 && adminGet.body?.success === true && Array.isArray(adminTasks)
    );

    // TEST 2: Admin sees personal tasks created by regular users
    const adminSeesUserPersonal = adminTaskIds.includes(task1.id) && adminTaskIds.includes(task5.id);
    record(
      'TEST 2: Admin sees personal tasks created by regular users',
      'Task 1 and Task 5 present in admin list',
      `Contains Task 1: ${adminTaskIds.includes(task1.id)}, Task 5: ${adminTaskIds.includes(task5.id)}`,
      adminSeesUserPersonal
    );

    // TEST 3: Admin sees personal tasks created by the admin
    const adminSeesAdminPersonal = adminTaskIds.includes(task2.id);
    record(
      'TEST 3: Admin sees personal tasks created by the admin',
      'Task 2 present in admin list',
      `Contains Task 2: ${adminSeesAdminPersonal}`,
      adminSeesAdminPersonal
    );

    // TEST 4: Admin sees team tasks
    const adminSeesTeamTasks = adminTaskIds.includes(task3.id) && adminTaskIds.includes(task4.id);
    record(
      'TEST 4: Admin sees team tasks',
      'Task 3 and Task 4 present in admin list',
      `Contains Task 3: ${adminTaskIds.includes(task3.id)}, Task 4: ${adminTaskIds.includes(task4.id)}`,
      adminSeesTeamTasks
    );

    // TEST 5: Admin sees tasks assigned to different regular users
    const adminSeesAllFive = adminTasks.length === 5 &&
      [task1.id, task2.id, task3.id, task4.id, task5.id].every((id) => adminTaskIds.includes(id));
    record(
      'TEST 5: Admin sees tasks assigned to different regular users',
      'All 5 tasks across all users visible to admin',
      `Admin saw ${adminTasks.length} tasks: [${adminTaskIds}]`,
      adminSeesAllFive
    );

    // TEST 6: Admin receives creator and assignment information
    const sampleTask = adminTasks.find((t) => t.id === task3.id);
    const hasSafeCreator = sampleTask?.creator &&
      sampleTask.creator.id === adminUser.id &&
      sampleTask.creator.email === adminUser.email &&
      sampleTask.creator.name &&
      sampleTask.creator.role === 'ADMIN';
    const hasSafeAssignments = Array.isArray(sampleTask?.assignments) &&
      sampleTask.assignments.length === 2 &&
      sampleTask.assignments[0].user &&
      sampleTask.assignments[0].user.email;
    record(
      'TEST 6: Admin receives creator and assignment information',
      'creator and assignments populated with safe fields (id, name, email, role)',
      `Creator: ${sampleTask?.creator?.email}, Assignees: ${sampleTask?.assignments?.map((a) => a.user?.email).join(', ')}`,
      hasSafeCreator && hasSafeAssignments
    );

    // ==========================================
    // B. USER VISIBILITY
    // ==========================================

    const user1Get = await fetchTasks(user1Token);
    const user1Tasks = user1Get.body?.data || [];
    const user1TaskIds = user1Tasks.map((t) => t.id);

    // TEST 7: A regular user sees their own personal tasks
    const user1SeesPersonal = user1TaskIds.includes(task1.id);
    record(
      'TEST 7: A regular user sees their own personal tasks',
      'Task 1 present in User 1 list',
      `Contains Task 1: ${user1SeesPersonal}`,
      user1Get.status === 200 && user1SeesPersonal
    );

    // TEST 8: A regular user sees team tasks assigned to them
    const user1SeesTeamTask = user1TaskIds.includes(task3.id);
    record(
      'TEST 8: A regular user sees team tasks assigned to them',
      'Task 3 present in User 1 list',
      `Contains Task 3: ${user1SeesTeamTask}`,
      user1SeesTeamTask
    );

    // TEST 9: A regular user does not see tasks assigned exclusively to another user
    const user1DoesNotSeeExclusiveTasks = !user1TaskIds.includes(task5.id) && !user1TaskIds.includes(task2.id);
    record(
      'TEST 9: A regular user does not see tasks assigned exclusively to another user',
      'Task 5 (User 2 personal) and Task 2 (Admin personal) absent from User 1 list',
      `Contains Task 5: ${user1TaskIds.includes(task5.id)}, Task 2: ${user1TaskIds.includes(task2.id)}`,
      user1DoesNotSeeExclusiveTasks
    );

    // TEST 10: A regular user does not see a team task assigned to another user simply because an admin created it
    const user1DoesNotSeeTask4 = !user1TaskIds.includes(task4.id);
    record(
      'TEST 10: Regular user does not see a team task assigned to another user simply because admin created it',
      'Task 4 absent from User 1 list',
      `Contains Task 4: ${user1TaskIds.includes(task4.id)}`,
      user1DoesNotSeeTask4
    );

    // TEST 11: A regular user cannot access tasks outside their permitted visibility through the list endpoint
    // User 1 must see EXACTLY Task 1 and Task 3, nothing else (total length = 2)
    const user1ExactTasks = user1Tasks.length === 2 &&
      user1TaskIds.includes(task1.id) &&
      user1TaskIds.includes(task3.id);
    record(
      'TEST 11: A regular user cannot access tasks outside their permitted visibility',
      'User 1 sees exactly [Task 3, Task 1] (count = 2)',
      `User 1 count: ${user1Tasks.length}, task IDs: [${user1TaskIds}]`,
      user1ExactTasks
    );

    // ==========================================
    // C. DUPLICATES AND EMPTY RESULTS
    // ==========================================

    // TEST 12: A team task assigned to multiple users appears only once in each authorized user's list
    const user2Get = await fetchTasks(user2Token);
    const user2Tasks = user2Get.body?.data || [];
    const user2TaskIds = user2Tasks.map((t) => t.id);

    const task3CountInUser1 = user1Tasks.filter((t) => t.id === task3.id).length;
    const task3CountInUser2 = user2Tasks.filter((t) => t.id === task3.id).length;
    const isTest12Pass = task3CountInUser1 === 1 && task3CountInUser2 === 1;
    record(
      'TEST 12: A team task assigned to multiple users appears only once in each authorized user list',
      'Task 3 appears exactly once for User 1 and exactly once for User 2',
      `Occurrences in User 1: ${task3CountInUser1}, in User 2: ${task3CountInUser2}`,
      isTest12Pass
    );

    // TEST 13: A user with no assigned tasks receives HTTP 200 and an empty task array
    const user3Get = await fetchTasks(user3Token);
    const isTest13Pass = user3Get.status === 200 &&
      user3Get.body?.success === true &&
      Array.isArray(user3Get.body?.data) &&
      user3Get.body.data.length === 0;
    record(
      'TEST 13: A user with no assigned tasks receives HTTP 200 and an empty task array',
      '200 OK with success: true and data: []',
      `Status: ${user3Get.status}, data length: ${user3Get.body?.data?.length}`,
      isTest13Pass
    );

    // ==========================================
    // D. AUTHENTICATION
    // ==========================================

    // TEST 14: A request without a token returns HTTP 401
    const noTokenGet = await fetchTasks(null);
    record(
      'TEST 14: A request without a token returns HTTP 401',
      '401 Unauthorized',
      `Status: ${noTokenGet.status}, message: "${noTokenGet.body?.message}"`,
      noTokenGet.status === 401 && noTokenGet.body?.success === false
    );

    // TEST 15: A request with an invalid token returns HTTP 401
    const invalidTokenGet = await fetchTasks('invalid.jwt.token');
    record(
      'TEST 15: A request with an invalid token returns HTTP 401',
      '401 Unauthorized',
      `Status: ${invalidTokenGet.status}, message: "${invalidTokenGet.body?.message}"`,
      invalidTokenGet.status === 401 && invalidTokenGet.body?.success === false
    );

    // TEST 16: An expired token returns HTTP 401
    const expiredToken = jwt.sign(
      { userId: user1.id, role: 'USER' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const expiredTokenGet = await fetchTasks(expiredToken);
    record(
      'TEST 16: An expired token returns HTTP 401',
      '401 Unauthorized with "Invalid or expired token"',
      `Status: ${expiredTokenGet.status}, message: "${expiredTokenGet.body?.message}"`,
      expiredTokenGet.status === 401 && expiredTokenGet.body?.success === false
    );

    // ==========================================
    // E. RESPONSE SECURITY AND DATA QUALITY
    // ==========================================

    // TEST 17: The response does not expose password or password-hash fields
    const adminResponseBody = JSON.stringify(adminGet.body);
    const hasPasswordInResponse =
      adminResponseBody.toLowerCase().includes('password') ||
      adminResponseBody.toLowerCase().includes('$2b$');
    record(
      'TEST 17: The response does not expose password or password-hash fields',
      'Response body strictly contains no password or bcrypt hash fields',
      `Contains password or $2b$: ${hasPasswordInResponse}`,
      !hasPasswordInResponse
    );

    // TEST 18: The response contains safe creator and assignment fields
    const firstTask = adminTasks[0];
    const safeCreatorKeys = firstTask?.creator ? Object.keys(firstTask.creator).sort() : [];
    const expectedCreatorKeys = ['email', 'id', 'name', 'role'];
    const safeAssignmentUserKeys = firstTask?.assignments?.[0]?.user
      ? Object.keys(firstTask.assignments[0].user).sort()
      : [];
    const isTest18Pass =
      JSON.stringify(safeCreatorKeys) === JSON.stringify(expectedCreatorKeys) &&
      (safeAssignmentUserKeys.length === 0 || JSON.stringify(safeAssignmentUserKeys) === JSON.stringify(expectedCreatorKeys));
    record(
      'TEST 18: The response contains safe creator and assignment fields',
      'Creator & Assignee user objects strictly contain only [email, id, name, role]',
      `Creator keys: [${safeCreatorKeys}], Assignee keys: [${safeAssignmentUserKeys}]`,
      isTest18Pass
    );

    // TEST 19: Tasks are returned in deterministic newest-first order
    let isNewestFirst = true;
    for (let i = 0; i < adminTasks.length - 1; i++) {
      const currentTime = new Date(adminTasks[i].created_at || adminTasks[i].createdAt).getTime();
      const nextTime = new Date(adminTasks[i + 1].created_at || adminTasks[i + 1].createdAt).getTime();
      if (currentTime < nextTime) {
        isNewestFirst = false;
        break;
      }
      if (currentTime === nextTime && adminTasks[i].id < adminTasks[i + 1].id) {
        isNewestFirst = false;
        break;
      }
    }
    record(
      'TEST 19: Tasks are returned in deterministic newest-first order',
      'Ordered by createdAt descending, id descending',
      `Newest first order verified: ${isNewestFirst}`,
      isNewestFirst
    );

    // TEST 20: Listing tasks does not create, update, or delete database records
    const taskCountBeforeRead = await prisma.task.count();
    const assignmentCountBeforeRead = await prisma.taskAssignment.count();
    const userCountBeforeRead = await prisma.user.count();

    await fetchTasks(adminToken);
    await fetchTasks(user1Token);
    await fetchTasks(user2Token);

    const taskCountAfterRead = await prisma.task.count();
    const assignmentCountAfterRead = await prisma.taskAssignment.count();
    const userCountAfterRead = await prisma.user.count();

    const isTest20Pass =
      taskCountBeforeRead === taskCountAfterRead &&
      assignmentCountBeforeRead === assignmentCountAfterRead &&
      userCountBeforeRead === userCountAfterRead;
    record(
      'TEST 20: Listing tasks does not create, update, or delete database records',
      'Database row counts remain unchanged across multiple read requests',
      `Tasks diff: ${taskCountAfterRead - taskCountBeforeRead}, Assignments diff: ${assignmentCountAfterRead - assignmentCountBeforeRead}`,
      isTest20Pass
    );

    // Print summary
    console.log('\n==================================================');
    console.log('STAGE 4B: GET /api/tasks TEST RESULTS');
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
      // Cleanup all test tasks and test assignments
      await prisma.taskAssignment.deleteMany({});
      await prisma.task.deleteMany({});

      // Cleanup test users (preserve seed users)
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

runListTasksTests();
