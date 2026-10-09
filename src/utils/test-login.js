require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const prisma = require('../config/prisma');

async function runLoginTests() {
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
    const adminInDb = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    const userInDb = await prisma.user.findUnique({ where: { email: 'user@example.com' } });

    // 1. Admin login with correct credentials
    const resAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'Admin@123',
      }),
    });
    const bodyAdmin = await resAdmin.json();
    const adminToken = bodyAdmin?.data?.token;
    record(
      'Admin login with correct credentials',
      '200 OK, JWT returned, role = ADMIN',
      `Status: ${resAdmin.status}, role: ${bodyAdmin?.data?.user?.role}, hasToken: ${!!adminToken}`,
      resAdmin.status === 200 &&
        bodyAdmin?.data?.user?.role === 'ADMIN' &&
        typeof adminToken === 'string' &&
        adminToken.length > 0
    );

    // 2. Regular user login with correct credentials
    const resUser = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'User@123',
      }),
    });
    const bodyUser = await resUser.json();
    const userToken = bodyUser?.data?.token;
    record(
      'Regular user login with correct credentials',
      '200 OK, JWT returned, role = USER',
      `Status: ${resUser.status}, role: ${bodyUser?.data?.user?.role}, hasToken: ${!!userToken}`,
      resUser.status === 200 &&
        bodyUser?.data?.user?.role === 'USER' &&
        typeof userToken === 'string' &&
        userToken.length > 0
    );

    // 3. Wrong admin password
    const resWrongAdminPw = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'WrongAdminPassword@999',
      }),
    });
    const bodyWrongAdminPw = await resWrongAdminPw.json();
    record(
      'Wrong admin password',
      '401 Unauthorized with generic message: "Invalid email or password"',
      `Status: ${resWrongAdminPw.status}, message: "${bodyWrongAdminPw.message}"`,
      resWrongAdminPw.status === 401 && bodyWrongAdminPw.message === 'Invalid email or password'
    );

    // 4. Wrong regular-user password
    const resWrongUserPw = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'WrongUserPassword@999',
      }),
    });
    const bodyWrongUserPw = await resWrongUserPw.json();
    record(
      'Wrong regular-user password',
      '401 Unauthorized with generic message: "Invalid email or password"',
      `Status: ${resWrongUserPw.status}, message: "${bodyWrongUserPw.message}"`,
      resWrongUserPw.status === 401 && bodyWrongUserPw.message === 'Invalid email or password'
    );

    // 5. Non-existent email
    const resNonExistent = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent_account_404@example.com',
        password: 'AnyPassword@123',
      }),
    });
    const bodyNonExistent = await resNonExistent.json();
    record(
      'Non-existent email',
      '401 Unauthorized with same generic message: "Invalid email or password"',
      `Status: ${resNonExistent.status}, message: "${bodyNonExistent.message}"`,
      resNonExistent.status === 401 && bodyNonExistent.message === 'Invalid email or password'
    );

    // 6. Missing email
    const resMissingEmail = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'Admin@123',
      }),
    });
    const bodyMissingEmail = await resMissingEmail.json();
    record(
      'Missing email',
      '400 Bad Request',
      `Status: ${resMissingEmail.status}, message: "${bodyMissingEmail.message}"`,
      resMissingEmail.status === 400 && bodyMissingEmail.success === false
    );

    // 7. Missing password
    const resMissingPassword = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
      }),
    });
    const bodyMissingPassword = await resMissingPassword.json();
    record(
      'Missing password',
      '400 Bad Request',
      `Status: ${resMissingPassword.status}, message: "${bodyMissingPassword.message}"`,
      resMissingPassword.status === 400 && bodyMissingPassword.success === false
    );

    // 8. Invalid email format
    const resInvalidEmail = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-a-valid-email',
        password: 'Admin@123',
      }),
    });
    const bodyInvalidEmail = await resInvalidEmail.json();
    record(
      'Invalid email format',
      '400 Bad Request',
      `Status: ${resInvalidEmail.status}, message: "${bodyInvalidEmail.message}"`,
      resInvalidEmail.status === 400 && bodyInvalidEmail.success === false
    );

    // 9. Email normalization
    const resNormalize = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '  ADMIN@EXAMPLE.COM  ',
        password: 'Admin@123',
      }),
    });
    const bodyNormalize = await resNormalize.json();
    record(
      'Email normalization (padded uppercase email)',
      '200 OK, authenticated as admin@example.com',
      `Status: ${resNormalize.status}, email: ${bodyNormalize?.data?.user?.email}`,
      resNormalize.status === 200 && bodyNormalize?.data?.user?.email === 'admin@example.com'
    );

    // 10. Verify response does NOT contain password or password hash
    const adminUserRes = bodyAdmin?.data?.user || {};
    const hasPasswordInRes =
      'password' in adminUserRes ||
      'hash' in adminUserRes ||
      JSON.stringify(bodyAdmin).toLowerCase().includes('password') && !bodyAdmin.message;
    record(
      'Verify response does NOT contain password or password hash',
      'Response user object has only id, name, email, role (no password/hash)',
      `Keys in user: ${Object.keys(adminUserRes).join(', ')}`,
      !('password' in adminUserRes) && !('hash' in adminUserRes)
    );

    // Decode JWTs
    const decodedAdmin = jwt.decode(adminToken);
    const decodedUser = jwt.decode(userToken);

    // 11. Verify JWT can be decoded and contains userId and role
    record(
      'Verify JWT can be decoded and contains userId and role',
      'decoded.userId and decoded.role match user',
      `Admin JWT: userId=${decodedAdmin?.userId}, role=${decodedAdmin?.role}`,
      decodedAdmin?.userId === adminInDb.id && decodedAdmin?.role === 'ADMIN'
    );

    // 12. Verify JWT does NOT contain password or password hash
    const jwtHasPassword =
      'password' in (decodedAdmin || {}) ||
      'hash' in (decodedAdmin || {}) ||
      'password' in (decodedUser || {}) ||
      'hash' in (decodedUser || {});
    record(
      'Verify JWT does NOT contain password or password hash',
      'No password or hash properties in decoded payload',
      `Keys in decoded admin token: ${Object.keys(decodedAdmin || {}).join(', ')}`,
      !jwtHasPassword
    );

    // 13. Verify JWT is actually signed and can be verified using secret
    let verifiedAdminPayload = null;
    try {
      verifiedAdminPayload = jwt.verify(adminToken, process.env.JWT_SECRET);
    } catch (_) {}
    record(
      'Verify JWT is signed and verifiable with configured secret',
      'jwt.verify succeeds without error',
      verifiedAdminPayload ? `Successfully verified for userId: ${verifiedAdminPayload.userId}` : 'Verification failed',
      !!verifiedAdminPayload
    );

    // 14. Verify JWT expiration is present/configured
    const hasExp = typeof decodedAdmin?.exp === 'number' && decodedAdmin.exp > Math.floor(Date.now() / 1000);
    const remainingSeconds = decodedAdmin ? decodedAdmin.exp - decodedAdmin.iat : 0;
    record(
      'Verify JWT expiration is present/configured',
      'exp claim is present in JWT (1 hour = 3600s)',
      `exp=${decodedAdmin?.exp}, validFor=${remainingSeconds}s`,
      hasExp && remainingSeconds >= 3500 && remainingSeconds <= 3600
    );

    // 15. Verify JWT role comes from database
    record(
      'Verify the JWT role comes from the database',
      `Admin role: ${adminInDb.role}, Regular user role: ${userInDb.role}`,
      `Admin JWT role: ${decodedAdmin?.role}, User JWT role: ${decodedUser?.role}`,
      decodedAdmin?.role === adminInDb.role && decodedUser?.role === userInDb.role
    );

    console.log(JSON.stringify(testResults, null, 2));

    const anyFailed = testResults.some((t) => t.status === 'FAIL');
    process.exitCode = anyFailed ? 1 : 0;
  } catch (err) {
    console.error('Login tests execution failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runLoginTests();
