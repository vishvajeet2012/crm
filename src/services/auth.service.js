'use strict';

const bcrypt = require('bcryptjs');
const Employee = require('../models/employee.model');
const env = require('../config/env');
const ApiError = require('../utils/api-error');
const HTTP_STATUS = require('../constants/http-status');
const { signToken } = require('../utils/jwt');

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function toSafeEmployee(employee) {
  return {
    _id: employee._id,
    name: employee.name,
    email: employee.email,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

async function registerEmployee({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existingEmployee = await Employee.exists({ email: normalizedEmail });

  if (existingEmployee) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      'An account with this email already exists',
    );
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  try {
    const employee = await Employee.create({
      name,
      email: normalizedEmail,
      passwordHash,
    });

    return toSafeEmployee(employee);
  } catch (error) {
    // The unique index closes the race between the pre-check and the insert.
    if (error?.code === 11000) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        'An account with this email already exists',
      );
    }
    throw error;
  }
}

async function loginEmployee({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const employee = await Employee.findOne({ email: normalizedEmail }).select(
    '+passwordHash',
  );

  if (!employee) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, employee.passwordHash);

  if (!passwordMatches) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid email or password');
  }

  return {
    token: signToken(employee._id),
    employee: toSafeEmployee(employee),
  };
}

module.exports = {
  registerEmployee,
  loginEmployee,
  normalizeEmail,
};

