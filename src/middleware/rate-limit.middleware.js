'use strict';

const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');
const HTTP_STATUS = require('../constants/http-status');

const RATE_LIMIT_MESSAGE = 'Too many requests. Please try again later.';

function buildLimiter(windowMs, limit) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler(req, res) {
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message: RATE_LIMIT_MESSAGE,
      });
    },
  });
}

const globalApiLimiter = buildLimiter(
  env.GLOBAL_RATE_LIMIT_WINDOW_MS,
  env.GLOBAL_RATE_LIMIT_MAX,
);

const registrationLimiter = buildLimiter(
  env.REGISTER_RATE_LIMIT_WINDOW_MS,
  env.REGISTER_RATE_LIMIT_MAX,
);

const loginLimiter = buildLimiter(
  env.LOGIN_RATE_LIMIT_WINDOW_MS,
  env.LOGIN_RATE_LIMIT_MAX,
);

const publicLeadLimiter = buildLimiter(
  env.PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS,
  env.PUBLIC_LEAD_RATE_LIMIT_MAX,
);

const claimLimiter = buildLimiter(
  env.CLAIM_RATE_LIMIT_WINDOW_MS,
  env.CLAIM_RATE_LIMIT_MAX,
);

module.exports = {
  globalApiLimiter,
  registrationLimiter,
  loginLimiter,
  publicLeadLimiter,
  claimLimiter,
  RATE_LIMIT_MESSAGE,
};

