require('dotenv').config();
const http = require('http');
const bcrypt = require('bcrypt');
const app = require('../app');
const prisma = require('../config/prisma');

async function runRegistrationTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const testResults = [];

  function record(test, expected, actual, passed) {
    testResults.push({
      test,
      expected,
      actual,
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  try {
    // Clean up any leftovers from previous test runs first (preserve seeded users)
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'rahul@gmail.com',
            'test_reg_admin@example.com',
            'normalizeme@example.com',
          ],
        },
      },
    });

    // 1. Valid registration
    const res1 = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rahul Sharma',
        email: 'rahul@gmail.com',
        password: 'Rahul@123',
      }),
    });
    const body1 = await res1.json();
    record(
      'Valid registration',
      '201 Created with success: true and user data',
      `Status: ${res1.status}, success: ${body1.success}`,
      res1.status === 201 && body1.success === true
    );

    // 2. Verify newly registered user exists in PostgreSQL
    const userInDb = await prisma.user.findUnique({
      where: { email: 'rahul@gmail.com' },
    });
    record(
      'Verify newly registered user exists in PostgreSQL',
      'User found in users table',
      userInDb ? `User found (id: ${userInDb.id}, email: ${userInDb.email})` : 'Not found',
      !!userInDb
    );

    // 3. Verify the new user's role is USER
    record(
      "Verify the new user's role is USER",
      'USER',
      userInDb?.role,
      userInDb?.role === 'USER'
    );

    // 4. Verify password is stored as a bcrypt hash
    const isBcryptHash = userInDb && /^\$2[abxy]\$\d+\$/.test(userInDb.password);
    record(
      'Verify password is stored as a bcrypt hash',
      'Valid bcrypt hash starting with $2b$',
      isBcryptHash ? 'Valid bcrypt hash confirmed' : 'Invalid hash format',
      isBcryptHash
    );

    // 5. Verify plaintext password is NOT stored
    const isNotPlaintext = userInDb && userInDb.password !== 'Rahul@123';
    record(
      'Verify plaintext password is NOT stored',
      'Stored password differs from plaintext Rahul@123',
      isNotPlaintext ? 'Password is encrypted/hashed, plaintext not stored' : 'Plaintext stored!',
      isNotPlaintext
    );

    // 6. Verify duplicate email registration
    const resDuplicate = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rahul Duplicate',
        email: 'rahul@gmail.com',
        password: 'AnotherPassword@123',
      }),
    });
    const bodyDuplicate = await resDuplicate.json();
    record(
      'Verify duplicate email registration',
      '409 Conflict with appropriate error message',
      `Status: ${resDuplicate.status}, message: "${bodyDuplicate.message}"`,
      resDuplicate.status === 409 && bodyDuplicate.success === false
    );

    // 7. Verify missing name
    const resMissingName = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'noname@example.com',
        password: 'Password@123',
      }),
    });
    const bodyMissingName = await resMissingName.json();
    record(
      'Verify missing name',
      '400 Bad Request',
      `Status: ${resMissingName.status}, message: "${bodyMissingName.message}"`,
      resMissingName.status === 400 && bodyMissingName.success === false
    );

    // 8. Verify missing email
    const resMissingEmail = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Email User',
        password: 'Password@123',
      }),
    });
    const bodyMissingEmail = await resMissingEmail.json();
    record(
      'Verify missing email',
      '400 Bad Request',
      `Status: ${resMissingEmail.status}, message: "${bodyMissingEmail.message}"`,
      resMissingEmail.status === 400 && bodyMissingEmail.success === false
    );

    // 9. Verify invalid email format
    const resInvalidEmail = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Email User',
        email: 'not-an-email',
        password: 'Password@123',
      }),
    });
    const bodyInvalidEmail = await resInvalidEmail.json();
    record(
      'Verify invalid email format',
      '400 Bad Request',
      `Status: ${resInvalidEmail.status}, message: "${bodyInvalidEmail.message}"`,
      resInvalidEmail.status === 400 && bodyInvalidEmail.success === false
    );

    // 10. Verify missing password
    const resMissingPassword = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Password User',
        email: 'nopassword@example.com',
      }),
    });
    const bodyMissingPassword = await resMissingPassword.json();
    record(
      'Verify missing password',
      '400 Bad Request',
      `Status: ${resMissingPassword.status}, message: "${bodyMissingPassword.message}"`,
      resMissingPassword.status === 400 && bodyMissingPassword.success === false
    );

    // 11. Verify password below minimum requirement (< 6 chars)
    const resShortPassword = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short Password User',
        email: 'shortpass@example.com',
        password: '12345',
      }),
    });
    const bodyShortPassword = await resShortPassword.json();
    record(
      'Verify password below the chosen minimum requirement',
      '400 Bad Request',
      `Status: ${resShortPassword.status}, message: "${bodyShortPassword.message}"`,
      resShortPassword.status === 400 && bodyShortPassword.success === false
    );

    // 12. Attempt to register with "role": "ADMIN"
    const resAdminAttempt = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hacker Attempt',
        email: 'test_reg_admin@example.com',
        password: 'Hacker@123',
        role: 'ADMIN',
      }),
    });
    const bodyAdminAttempt = await resAdminAttempt.json();
    const adminAttemptDbUser = await prisma.user.findUnique({
      where: { email: 'test_reg_admin@example.com' },
    });
    record(
      'Attempt to register with role: ADMIN (Verify role cannot be chosen)',
      'Account created with role USER (ignoring requested ADMIN)',
      `API role: ${bodyAdminAttempt?.data?.role}, DB role: ${adminAttemptDbUser?.role}`,
      bodyAdminAttempt?.data?.role === 'USER' && adminAttemptDbUser?.role === 'USER'
    );

    // 13. Verify email normalization
    const resNormalize = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '   Padded Name   ',
        email: '  NormalizeMe@Example.COM  ',
        password: 'Normalize@123',
      }),
    });
    const bodyNormalize = await resNormalize.json();
    const normalizedUserInDb = await prisma.user.findUnique({
      where: { email: 'normalizeme@example.com' },
    });
    record(
      'Verify email normalization',
      'Stored email is trimmed and lowercase (normalizeme@example.com), name trimmed',
      `API email: "${bodyNormalize?.data?.email}", DB email: "${normalizedUserInDb?.email}", DB name: "${normalizedUserInDb?.name}"`,
      bodyNormalize?.data?.email === 'normalizeme@example.com' &&
        normalizedUserInDb?.email === 'normalizeme@example.com' &&
        normalizedUserInDb?.name === 'Padded Name'
    );

    // 14. Verify registration does not expose password or password hash
    const responseHasPassword =
      'password' in (body1.data || {}) ||
      'hash' in (body1.data || {}) ||
      JSON.stringify(body1).toLowerCase().includes('password') && !body1.message;
    record(
      'Verify registration does not expose password or password hash',
      'Response data contains only id, name, email, role (no password/hash)',
      `Keys in data: ${Object.keys(body1.data || {}).join(', ')}`,
      !('password' in (body1.data || {})) && !('hash' in (body1.data || {}))
    );

    // Print all results as JSON
    console.log(JSON.stringify(testResults, null, 2));

    const anyFailed = testResults.some((t) => t.status === 'FAIL');
    process.exitCode = anyFailed ? 1 : 0;
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [
              'rahul@gmail.com',
              'test_reg_admin@example.com',
              'normalizeme@example.com',
            ],
          },
        },
      });
    } catch (_) {}
    server.close();
    await prisma.$disconnect();
  }
}

runRegistrationTests();
