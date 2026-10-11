'use strict';

const express = require('express');
const authController = require('../../controllers/auth.controller');
const validate = require('../../middleware/validate.middleware');
const asyncHandler = require('../../utils/async-handler');
const {
  registrationLimiter,
  loginLimiter,
} = require('../../middleware/rate-limit.middleware');
const {
  registerSchema,
  loginSchema,
} = require('../../validators/auth.validator');

const router = express.Router();

router.post(
  '/register',
  registrationLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register),
);

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

module.exports = router;

