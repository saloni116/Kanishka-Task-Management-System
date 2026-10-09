require('dotenv').config();
const http = require('http');
const app = require('../app');
const prisma = require('../config/prisma');

async function runAuthorizationTests() {
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

  function makeHttpRequest({ hostname, port, path, method = 'GET', headers = {} }, bodyData = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname,
          port,
          path,
          method,
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let json;
            try {
              json = JSON.parse(data);
            } catch {
              json = data;
            }
            resolve({ status: res.statusCode, headers: res.headers, body: json });
          });
        }
      );
      req.on('error', reject);
      if (bodyData) {
        req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
      }
      req.end();
    });
  }

  try {
    // 1. Obtain Admin JWT
    const resLoginAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Admin@123' }),
    });
    const bodyLoginAdmin = await resLoginAdmin.json();
    const adminToken = bodyLoginAdmin?.data?.token;

    // 2. Obtain Regular User JWT
    const resLoginUser = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'User@123' }),
    });
    const bodyLoginUser = await resLoginUser.json();
    const userToken = bodyLoginUser?.data?.token;

    // TEST 1 — ADMIN -> ADMIN route
    const resAdminToAdmin = await fetch(`${baseUrl}/api/auth/admin-test`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bodyAdminToAdmin = await resAdminToAdmin.json();
    record(
      'TEST 1 — ADMIN -> ADMIN route',
      '200 OK with success: true',
      `Status: ${resAdminToAdmin.status}, message: "${bodyAdminToAdmin.message}"`,
      resAdminToAdmin.status === 200 && bodyAdminToAdmin.success === true
    );

    // TEST 2 — USER -> ADMIN route
    const resUserToAdmin = await fetch(`${baseUrl}/api/auth/admin-test`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const bodyUserToAdmin = await resUserToAdmin.json();
    record(
      'TEST 2 — USER -> ADMIN route',
      '403 Forbidden with Access denied',
      `Status: ${resUserToAdmin.status}, message: "${bodyUserToAdmin.message}"`,
      resUserToAdmin.status === 403 && bodyUserToAdmin.message === 'Access denied'
    );

    // TEST 3 — USER -> USER route
    const resUserToUser = await fetch(`${baseUrl}/api/auth/user-test`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const bodyUserToUser = await resUserToUser.json();
    record(
      'TEST 3 — USER -> USER route',
      '200 OK with success: true',
      `Status: ${resUserToUser.status}, message: "${bodyUserToUser.message}"`,
      resUserToUser.status === 200 && bodyUserToUser.success === true
    );

    // TEST 4 — ADMIN -> USER route
    const resAdminToUser = await fetch(`${baseUrl}/api/auth/user-test`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bodyAdminToUser = await resAdminToUser.json();
    record(
      'TEST 4 — ADMIN -> USER route',
      '403 Forbidden with Access denied',
      `Status: ${resAdminToUser.status}, message: "${bodyAdminToUser.message}"`,
      resAdminToUser.status === 403 && bodyAdminToUser.message === 'Access denied'
    );

    // TEST 5 — No token -> ADMIN route
    const resNoTokenAdmin = await fetch(`${baseUrl}/api/auth/admin-test`);
    const bodyNoTokenAdmin = await resNoTokenAdmin.json();
    record(
      'TEST 5 — No token -> ADMIN route',
      '401 Unauthorized',
      `Status: ${resNoTokenAdmin.status}, message: "${bodyNoTokenAdmin.message}"`,
      resNoTokenAdmin.status === 401 && bodyNoTokenAdmin.success === false
    );

    // TEST 6 — No token -> USER route
    const resNoTokenUser = await fetch(`${baseUrl}/api/auth/user-test`);
    const bodyNoTokenUser = await resNoTokenUser.json();
    record(
      'TEST 6 — No token -> USER route',
      '401 Unauthorized',
      `Status: ${resNoTokenUser.status}, message: "${bodyNoTokenUser.message}"`,
      resNoTokenUser.status === 401 && bodyNoTokenUser.success === false
    );

    // TEST 7 — Invalid token -> ADMIN route
    const resInvalidTokenAdmin = await fetch(`${baseUrl}/api/auth/admin-test`, {
      headers: { Authorization: 'Bearer invalid.malformed.token' },
    });
    const bodyInvalidTokenAdmin = await resInvalidTokenAdmin.json();
    record(
      'TEST 7 — Invalid token -> ADMIN route',
      '401 Unauthorized',
      `Status: ${resInvalidTokenAdmin.status}, message: "${bodyInvalidTokenAdmin.message}"`,
      resInvalidTokenAdmin.status === 401 && bodyInvalidTokenAdmin.success === false
    );

    // TEST 8 — Invalid token -> USER route
    const resInvalidTokenUser = await fetch(`${baseUrl}/api/auth/user-test`, {
      headers: { Authorization: 'Bearer invalid.malformed.token' },
    });
    const bodyInvalidTokenUser = await resInvalidTokenUser.json();
    record(
      'TEST 8 — Invalid token -> USER route',
      '401 Unauthorized',
      `Status: ${resInvalidTokenUser.status}, message: "${bodyInvalidTokenUser.message}"`,
      resInvalidTokenUser.status === 401 && bodyInvalidTokenUser.success === false
    );

    // TEST 9 — Role tampering in request body (sending role: "ADMIN" in body with USER JWT)
    const tamperReqBody = JSON.stringify({ role: 'ADMIN' });
    const resTamperBody = await makeHttpRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/auth/admin-test',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(tamperReqBody),
        },
      },
      tamperReqBody
    );
    record(
      'TEST 9 — Role tampering in request body',
      '403 Forbidden (Body role ignored)',
      `Status: ${resTamperBody.status}, message: "${resTamperBody.body.message}"`,
      resTamperBody.status === 403 && resTamperBody.body.message === 'Access denied'
    );

    // TEST 10 — Role tampering in query (?role=ADMIN with USER JWT)
    const resTamperQuery = await fetch(`${baseUrl}/api/auth/admin-test?role=ADMIN`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const bodyTamperQuery = await resTamperQuery.json();
    record(
      'TEST 10 — Role tampering in query',
      '403 Forbidden (Query param role ignored)',
      `Status: ${resTamperQuery.status}, message: "${bodyTamperQuery.message}"`,
      resTamperQuery.status === 403 && bodyTamperQuery.message === 'Access denied'
    );

    // TEST 11 — Role tampering in header (X-Role: ADMIN with USER JWT)
    const resTamperHeader = await fetch(`${baseUrl}/api/auth/admin-test`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        'X-Role': 'ADMIN',
      },
    });
    const bodyTamperHeader = await resTamperHeader.json();
    record(
      'TEST 11 — Role tampering in header',
      '403 Forbidden (Custom header X-Role ignored)',
      `Status: ${resTamperHeader.status}, message: "${bodyTamperHeader.message}"`,
      resTamperHeader.status === 403 && bodyTamperHeader.message === 'Access denied'
    );

    // TEST 12 — Authentication/authorization distinction
    const distinctionCheck =
      resNoTokenAdmin.status === 401 && resUserToAdmin.status === 403;
    record(
      'TEST 12 — Authentication/authorization distinction',
      'No token -> 401 Unauthorized, Authenticated with wrong role -> 403 Forbidden',
      `No-token: ${resNoTokenAdmin.status}, Wrong-role: ${resUserToAdmin.status}`,
      distinctionCheck
    );

    // DIRECT CHECK — Missing req.user in authorize middleware (authenticate was bypassed)
    const { authorize } = require('../middleware/authorize');
    let capturedStatus = null;
    let capturedBody = null;
    const mockRes = {
      status(code) {
        capturedStatus = code;
        return {
          json(body) {
            capturedBody = body;
          },
        };
      },
    };
    authorize('ADMIN')({}, mockRes, () => {});
    record(
      'DIRECT CHECK — Missing req.user in authorize middleware',
      '401 Unauthorized with message "Authentication required"',
      `Status: ${capturedStatus}, message: "${capturedBody?.message}"`,
      capturedStatus === 401 && capturedBody?.message === 'Authentication required'
    );

    console.log(JSON.stringify(testResults, null, 2));

    const anyFailed = testResults.some((t) => t.status === 'FAIL');
    process.exitCode = anyFailed ? 1 : 0;
  } catch (err) {
    console.error('Authorization test execution failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAuthorizationTests();
