const express = require('express');
const {
  register,
  login,
  getMe,
  adminTest,
  userTest,
} = require('../controllers/authController');
const { validateRegistration } = require('../middleware/validateRegistration');
const { validateLogin } = require('../middleware/validateLogin');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

// Public Authentication Routes
// POST /api/auth/register
router.post('/register', validateRegistration, register);

// POST /api/auth/login
router.post('/login', validateLogin, login);

// Protected Verification Route
// GET /api/auth/me
router.get('/me', authenticate, getMe);

// Role-Based Authorization Verification Routes
// GET /api/auth/admin-test (Accessible only to ADMIN)
router.get('/admin-test', authenticate, authorize('ADMIN'), adminTest);

// GET /api/auth/user-test (Accessible only to USER)
router.get('/user-test', authenticate, authorize('USER'), userTest);

module.exports = router;
