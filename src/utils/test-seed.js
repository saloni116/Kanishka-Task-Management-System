require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

async function runSeedVerification() {
  const results = [];

  function recordTest(name, expected, actual, passed) {
    results.push({
      test: name,
      expected,
      actual,
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  try {
    const allUsers = await prisma.user.findMany();
    const adminAccounts = await prisma.user.findMany({ where: { email: 'admin@example.com' } });
    const userAccounts = await prisma.user.findMany({ where: { email: 'user@example.com' } });

    const admin = adminAccounts[0];
    const regularUser = userAccounts[0];

    // Total count & existence
    recordTest(
      'Admin existence',
      'User with email admin@example.com exists',
      admin ? `Found (id: ${admin.id}, email: ${admin.email})` : 'Not found',
      !!admin
    );

    recordTest(
      'Regular user existence',
      'User with email user@example.com exists',
      regularUser ? `Found (id: ${regularUser.id}, email: ${regularUser.email})` : 'Not found',
      !!regularUser
    );

    // Duplicate prevention
    recordTest(
      'Duplicate prevention/idempotency',
      'Exactly 1 record per seeded email, total 2 seeded users',
      `adminAccounts: ${adminAccounts.length}, userAccounts: ${userAccounts.length}, total: ${allUsers.length}`,
      adminAccounts.length === 1 && userAccounts.length === 1 && allUsers.length === 2
    );

    // Roles
    recordTest(
      'Admin role',
      'ADMIN',
      admin?.role,
      admin?.role === 'ADMIN'
    );

    recordTest(
      'Regular user role',
      'USER',
      regularUser?.role,
      regularUser?.role === 'USER'
    );

    // Hash checks (ensure not plaintext and valid bcrypt format)
    const adminIsHashed = admin && admin.password !== 'Admin@123' && /^\$2[abxy]\$\d+\$/.test(admin.password);
    recordTest(
      'Admin password hash',
      'Non-plaintext bcrypt hash string starting with $2b$',
      adminIsHashed ? 'Valid bcrypt hash format (non-plaintext)' : 'Invalid or plaintext',
      adminIsHashed
    );

    const userIsHashed = regularUser && regularUser.password !== 'User@123' && /^\$2[abxy]\$\d+\$/.test(regularUser.password);
    recordTest(
      'Regular user password hash',
      'Non-plaintext bcrypt hash string starting with $2b$',
      userIsHashed ? 'Valid bcrypt hash format (non-plaintext)' : 'Invalid or plaintext',
      userIsHashed
    );

    // Password comparisons
    const adminPwMatch = admin ? await bcrypt.compare('Admin@123', admin.password) : false;
    recordTest(
      'Correct admin password comparison',
      'true',
      String(adminPwMatch),
      adminPwMatch === true
    );

    const userPwMatch = regularUser ? await bcrypt.compare('User@123', regularUser.password) : false;
    recordTest(
      'Correct user password comparison',
      'true',
      String(userPwMatch),
      userPwMatch === true
    );

    const adminWrongPwMatch = admin ? await bcrypt.compare('WrongPassword!999', admin.password) : true;
    const userWrongPwMatch = regularUser ? await bcrypt.compare('WrongPassword!999', regularUser.password) : true;
    const incorrectRejected = !adminWrongPwMatch && !userWrongPwMatch;
    recordTest(
      'Incorrect password rejection',
      'false for both admin and regular user',
      `adminMatch: ${adminWrongPwMatch}, userMatch: ${userWrongPwMatch}`,
      incorrectRejected
    );

    console.log(JSON.stringify(results, null, 2));

    const anyFailed = results.some((r) => r.status === 'FAIL');
    process.exit(anyFailed ? 1 : 0);
  } catch (err) {
    console.error('Verification failed with error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSeedVerification();
