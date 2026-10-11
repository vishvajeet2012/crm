'use strict';

const { z } = require('zod');

const normalizedCourse = z
  .string({ error: 'Course interest is required' })
  .trim()
  .min(1, 'Course interest is required')
  .max(100, 'Course interest is too long')
  .transform((course) => course.toLowerCase());

const createLeadSchema = z
  .object({
    name: z
      .string({ error: 'Name is required' })
      .trim()
      .min(2, 'Name must contain at least 2 characters')
      .max(100, 'Name is too long'),
    email: z
      .string({ error: 'Email is required' })
      .trim()
      .max(254, 'Email is too long')
      .email('Email must be valid')
      .transform((email) => email.toLowerCase()),
    phone: z.string().trim().min(5, 'Phone number is too short').max(30).optional(),
    courseInterest: normalizedCourse,
    age: z.number().int().min(10).max(120).optional(),
    message: z.string().trim().max(2000, 'Message is too long').optional(),
  })
  .strict();

const positiveIntegerQuery = (field, defaultValue, maximum = undefined) => {
  let schema = z.preprocess(
    (value) => (value === undefined ? String(defaultValue) : value),
    z
      .string({ error: `${field} must be a positive integer` })
      .regex(/^[1-9]\d*$/, `${field} must be a positive integer`)
      .transform(Number),
  ).refine(Number.isSafeInteger, `${field} is too large`);

  if (maximum !== undefined) {
    schema = schema.refine((value) => value <= maximum, `${field} must be at most ${maximum}`);
  }

  return schema;
};

const optionalAgeQuery = (field) =>
  z
    .string({ error: `${field} must be an integer` })
    .regex(/^\d+$/, `${field} must be an integer`)
    .transform(Number)
    .refine((age) => age >= 10 && age <= 120, `${field} must be between 10 and 120`)
    .optional();

const paginationFields = {
  page: positiveIntegerQuery('page', 1),
  limit: positiveIntegerQuery('limit', 10, 100),
};

const unclaimedQuerySchema = z
  .object({
    ...paginationFields,
    courseInterest: normalizedCourse.optional(),
    minAge: optionalAgeQuery('minAge'),
    maxAge: optionalAgeQuery('maxAge'),
  })
  .strict()
  .refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
    message: 'page is too large for the requested limit',
    path: ['page'],
  })
  .refine(
    ({ minAge, maxAge }) => minAge === undefined || maxAge === undefined || minAge <= maxAge,
    {
      message: 'minAge cannot be greater than maxAge',
      path: ['minAge'],
    },
  );

const myLeadsQuerySchema = z
  .object({
    ...paginationFields,
  })
  .strict()
  .refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
    message: 'page is too large for the requested limit',
    path: ['page'],
  });

const leadIdParamSchema = z
  .object({
    id: z
      .string({ error: 'Lead ID is required' })
      .regex(/^[a-fA-F0-9]{24}$/, 'Lead ID must be a valid ObjectId'),
  })
  .strict();

const emptyBodySchema = z.object({}).strict();

module.exports = {
  createLeadSchema,
  unclaimedQuerySchema,
  myLeadsQuerySchema,
  leadIdParamSchema,
  emptyBodySchema,
};

