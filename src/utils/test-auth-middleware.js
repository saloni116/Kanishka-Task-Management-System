require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const prisma = require('../config/prisma');

async function runAuthMiddlewareTests() {
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
    const jwtSecret = process.env.JWT_SECRET;

    // Login as Admin to get Admin JWT
    const resLoginAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Admin@123' }),
    });
    const bodyLoginAdmin = await resLoginAdmin.json();
    const adminToken = bodyLoginAdmin?.data?.token;

    // Login as Regular User to get User JWT
    const resLoginUser = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'User@123' }),
    });
    const bodyLoginUser = await resLoginUser.json();
    const userToken = bodyLoginUser?.data?.token;

    // 1. Valid ADMIN token
    const resAdminMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bodyAdminMe = await resAdminMe.json();
    record(
      'TEST 1 — Valid ADMIN token',
      '200 OK, req.user.role = ADMIN',
      `Status: ${resAdminMe.status}, role: ${bodyAdminMe?.data?.user?.role}`,
      resAdminMe.status === 200 && bodyAdminMe?.data?.user?.role === 'ADMIN'
    );

    // 2. Valid USER token
    const resUserMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const bodyUserMe = await resUserMe.json();
    record(
      'TEST 2 — Valid USER token',
      '200 OK, req.user.role = USER',
      `Status: ${resUserMe.status}, role: ${bodyUserMe?.data?.user?.role}`,
      resUserMe.status === 200 && bodyUserMe?.data?.user?.role === 'USER'
    );

    // 3. Missing Authorization header
    const resMissingAuth = await fetch(`${baseUrl}/api/auth/me`);
    const bodyMissingAuth = await resMissingAuth.json();
    record(
      'TEST 3 — Missing Authorization header',
      '401 Unauthorized',
      `Status: ${resMissingAuth.status}, message: "${bodyMissingAuth.message}"`,
      resMissingAuth.status === 401 && bodyMissingAuth.success === false
    );

    // 4. Invalid Bearer format (Basic or raw token)
    const resInvalidFormat = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Basic ${adminToken}` },
    });
    const bodyInvalidFormat = await resInvalidFormat.json();
    record(
      'TEST 4 — Invalid Bearer format',
      '401 Unauthorized',
      `Status: ${resInvalidFormat.status}, message: "${bodyInvalidFormat.message}"`,
      resInvalidFormat.status === 401 && bodyInvalidFormat.success === false
    );

    // 5. Malformed JWT
    const resMalformed = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer this.is.not.a.valid.jwt' },
    });
    const bodyMalformed = await resMalformed.json();
    record(
      'TEST 5 — Malformed JWT',
      '401 Unauthorized',
      `Status: ${resMalformed.status}, message: "${bodyMalformed.message}"`,
      resMalformed.status === 401 && bodyMalformed.success === false
    );

    // 6. Wrong signature
    const wrongSecretToken = jwt.sign(
      { userId: bodyAdminMe?.data?.user?.id, role: 'ADMIN' },
      'completely_different_unauthorized_secret_key',
      { expiresIn: '1h' }
    );
    const resWrongSig = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${wrongSecretToken}` },
    });
    const bodyWrongSig = await resWrongSig.json();
    record(
      'TEST 6 — Wrong signature',
      '401 Unauthorized',
      `Status: ${resWrongSig.status}, message: "${bodyWrongSig.message}"`,
      resWrongSig.status === 401 && bodyWrongSig.success === false
    );

    // 7. Expired JWT
    const expiredToken = jwt.sign(
      { userId: bodyAdminMe?.data?.user?.id, role: 'ADMIN' },
      jwtSecret,
      { expiresIn: '-10s' }
    );
    const resExpired = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const bodyExpired = await resExpired.json();
    record(
      'TEST 7 — Expired JWT',
      '401 Unauthorized',
      `Status: ${resExpired.status}, message: "${bodyExpired.message}"`,
      resExpired.status === 401 && bodyExpired.success === false
    );

    // 8. Missing userId
    const missingUserIdToken = jwt.sign(
      { role: 'ADMIN' },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const resMissingUserId = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${missingUserIdToken}` },
    });
    const bodyMissingUserId = await resMissingUserId.json();
    record(
      'TEST 8 — Missing userId',
      '401 Unauthorized',
      `Status: ${resMissingUserId.status}, message: "${bodyMissingUserId.message}"`,
      resMissingUserId.status === 401 && bodyMissingUserId.success === false
    );

    // 9. Non-existent user
    const nonExistentUserToken = jwt.sign(
      { userId: 999999, role: 'USER' },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const resNonExistent = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${nonExistentUserToken}` },
    });
    const bodyNonExistent = await resNonExistent.json();
    record(
      'TEST 9 — Non-existent user',
      '401 Unauthorized',
      `Status: ${resNonExistent.status}, message: "${bodyNonExistent.message}"`,
      resNonExistent.status === 401 && bodyNonExistent.success === false
    );

    // 10. Safe req.user (contains id, name, email, role; NO password or passwordHash)
    const userObj = bodyAdminMe?.data?.user || {};
    const hasPassword = 'password' in userObj || 'passwordHash' in userObj || 'hash' in userObj;
    const hasRequiredFields = 'id' in userObj && 'name' in userObj && 'email' in userObj && 'role' in userObj;
    record(
      'TEST 10 — Safe req.user',
      'Contains id, name, email, role; does NOT contain password or passwordHash',
      `Fields: ${Object.keys(userObj).join(', ')}, hasPassword: ${hasPassword}`,
      hasRequiredFields && !hasPassword
    );

    // 11. ADMIN identity
    record(
      'TEST 11 — ADMIN identity',
      'admin@example.com authenticated with role = ADMIN',
      `Email: ${bodyAdminMe?.data?.user?.email}, Role: ${bodyAdminMe?.data?.user?.role}`,
      bodyAdminMe?.data?.user?.email === 'admin@example.com' && bodyAdminMe?.data?.user?.role === 'ADMIN'
    );

    // 12. USER identity
    record(
      'TEST 12 — USER identity',
      'user@example.com authenticated with role = USER',
      `Email: ${bodyUserMe?.data?.user?.email}, Role: ${bodyUserMe?.data?.user?.role}`,
      bodyUserMe?.data?.user?.email === 'user@example.com' && bodyUserMe?.data?.user?.role === 'USER'
    );

    // 13. Public health route
    const resHealth = await fetch(`${baseUrl}/api/health`);
    const bodyHealth = await resHealth.json();
    record(
      'TEST 13 — Public health route',
      '200 OK without JWT',
      `Status: ${resHealth.status}, success: ${bodyHealth.success}`,
      resHealth.status === 200 && bodyHealth.success === true
    );

    // 14. Public registration route
    const tempEmail = 'temp_stage3d_test@example.com';
    const resRegister = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Temp Registration Test',
        email: tempEmail,
        password: 'TempPassword@123',
      }),
    });
    const bodyRegister = await resRegister.json();
    // Clean up temporary user immediately
    await prisma.user.deleteMany({ where: { email: tempEmail } });
    record(
      'TEST 14 — Public registration route',
      '201 Created without JWT, test record cleaned up',
      `Status: ${resRegister.status}, success: ${bodyRegister.success}`,
      resRegister.status === 201 && bodyRegister.success === true
    );

    // 15. Public login route
    const resPublicLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Admin@123' }),
    });
    const bodyPublicLogin = await resPublicLogin.json();
    record(
      'TEST 15 — Public login route',
      '200 OK without JWT',
      `Status: ${resPublicLogin.status}, hasToken: ${!!bodyPublicLogin?.data?.token}`,
      resPublicLogin.status === 200 && !!bodyPublicLogin?.data?.token
    );

    console.log(JSON.stringify(testResults, null, 2));

    const anyFailed = testResults.some((t) => t.status === 'FAIL');
    process.exitCode = anyFailed ? 1 : 0;
  } catch (err) {
    console.error('Auth middleware test execution failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAuthMiddlewareTests();
