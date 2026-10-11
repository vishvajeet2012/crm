'use strict';

const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

const positiveInteger = (defaultValue) =>
  z.coerce.number().int().positive().default(defaultValue);

const rateLimitWindow = (defaultValue) =>
  z.coerce
    .number()
    .int()
    .positive()
    .max(2_147_483_647, 'Rate-limit windows cannot exceed 2147483647ms')
    .default(defaultValue);

function jwtExpirationInSeconds(value) {
  const match = value.match(/^([1-9]\d*)(ms|s|m|h|d|w|y)?$/i);
  if (!match) {
    return Number.NaN;
  }

  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = {
    ms: 1 / 1000,
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
    y: 365.25 * 24 * 60 * 60,
  };
  return amount * multipliers[unit];
}

const jwtExpiration = z
  .string()
  .trim()
  .regex(
    /^[1-9]\d*(?:ms|s|m|h|d|w|y)?$/i,
    'JWT_EXPIRES_IN must be a positive duration such as 15m, 1h, or 1d',
  )
  .refine((value) => {
    const seconds = jwtExpirationInSeconds(value);
    return Number.isFinite(seconds) && seconds >= 1 && seconds <= 10 * 365.25 * 24 * 60 * 60;
  }, 'JWT_EXPIRES_IN must be between 1 second and 10 years');

function bodyLimitInBytes(value) {
  const match = value.match(/^([1-9]\d*)(b|kb|mb)?$/i);
  if (!match) {
    return Number.NaN;
  }

  const multipliers = { b: 1, kb: 1024, mb: 1024 * 1024 };
  return Number(match[1]) * multipliers[(match[2] || 'b').toLowerCase()];
}

const jsonBodyLimit = z
  .string()
  .trim()
  .regex(
    /^[1-9]\d*(?:b|kb|mb)?$/i,
    'JSON_BODY_LIMIT must be a positive byte value such as 100kb or 1mb',
  )
  .refine(
    (value) => bodyLimitInBytes(value) <= 10 * 1024 * 1024,
    'JSON_BODY_LIMIT cannot exceed 10mb',
  );

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must contain at least 32 characters'),
  JWT_EXPIRES_IN: jwtExpiration.default('1d'),
  CORS_ORIGIN: z.string().trim().min(1).default('http://localhost:3000'),
  TRUST_PROXY: z.string().trim().default('false'),
  JSON_BODY_LIMIT: jsonBodyLimit.default('100kb'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  GLOBAL_RATE_LIMIT_WINDOW_MS: rateLimitWindow(15 * 60 * 1000),
  GLOBAL_RATE_LIMIT_MAX: positiveInteger(120),
  REGISTER_RATE_LIMIT_WINDOW_MS: rateLimitWindow(60 * 60 * 1000),
  REGISTER_RATE_LIMIT_MAX: positiveInteger(5),
  LOGIN_RATE_LIMIT_WINDOW_MS: rateLimitWindow(15 * 60 * 1000),
  LOGIN_RATE_LIMIT_MAX: positiveInteger(10),
  PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS: rateLimitWindow(60 * 60 * 1000),
  PUBLIC_LEAD_RATE_LIMIT_MAX: positiveInteger(20),
  CLAIM_RATE_LIMIT_WINDOW_MS: rateLimitWindow(60 * 1000),
  CLAIM_RATE_LIMIT_MAX: positiveInteger(60),
});

function parseTrustProxy(rawValue, nodeEnv) {
  const value = rawValue.trim().toLowerCase();

  if (['false', '0', 'off', 'no'].includes(value)) {
    return false;
  }

  if (['true', 'on', 'yes'].includes(value)) {
    if (nodeEnv === 'production') {
      throw new Error(
        'TRUST_PROXY=true is unsafe in production; configure an explicit hop count or trusted proxy range',
      );
    }
    return true;
  }

  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (!Number.isSafeInteger(hops) || hops > 16) {
      throw new Error('TRUST_PROXY hop count must be an integer between 0 and 16');
    }
    return hops;
  }

  if (/^-/.test(value)) {
    throw new Error('TRUST_PROXY hop count cannot be negative');
  }

  // Express accepts named subnet groups, IP addresses, CIDRs, and comma-separated lists.
  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const rawEnvironment = {
  ...process.env,
  // Compatibility with the pre-existing local workspace. New deployments should
  // always use the documented MONGODB_URI variable.
  MONGODB_URI: process.env.MONGODB_URI || process.env.EC2_MONGO_URI,
};

const parsed = environmentSchema.safeParse(rawEnvironment);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${problems}`);
}

const env = {
  ...parsed.data,
  // jsonwebtoken interprets numeric strings as milliseconds; convert a unitless
  // duration to a number so environment values such as "3600" mean seconds.
  JWT_EXPIRES_IN: /^\d+$/.test(parsed.data.JWT_EXPIRES_IN)
    ? Number(parsed.data.JWT_EXPIRES_IN)
    : parsed.data.JWT_EXPIRES_IN,
  TRUST_PROXY: parseTrustProxy(parsed.data.TRUST_PROXY, parsed.data.NODE_ENV),
};

module.exports = Object.freeze(env);

