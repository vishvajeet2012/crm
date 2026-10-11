'use strict';

const { z } = require('zod');

const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .max(254, 'Email is too long')
  .email('Email must be valid')
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must contain at least 8 characters')
  .max(72, 'Password must contain at most 72 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must contain at most 72 UTF-8 bytes',
  );

const registerSchema = z
  .object({
    name: z
      .string({ error: 'Name is required' })
      .trim()
      .min(2, 'Name must contain at least 2 characters')
      .max(100, 'Name is too long'),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string({ error: 'Password is required' })
      .min(1, 'Password is required')
      .max(72, 'Password is too long')
      .refine(
        (password) => Buffer.byteLength(password, 'utf8') <= 72,
        'Password is too long',
      ),
  })
  .strict();

module.exports = {
  registerSchema,
  loginSchema,
};

