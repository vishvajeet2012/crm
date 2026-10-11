'use strict';

const mongoose = require('mongoose');
const Employee = require('../models/employee.model');
const ApiError = require('../utils/api-error');
const HTTP_STATUS = require('../constants/http-status');
const { verifyToken } = require('../utils/jwt');
const asyncHandler = require('../utils/async-handler');

const authenticate = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization');

  if (!authorization) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication token is required');
  }

  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      'Authorization header must use the Bearer scheme',
    );
  }

  let payload;
  try {
    payload = verifyToken(match[1]);
  } catch (error) {
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      'Authentication token is invalid or expired',
    );
  }

  if (!payload.sub || !mongoose.isObjectIdOrHexString(payload.sub)) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication token is invalid');
  }

  const employee = await Employee.findById(payload.sub)
    .select('_id name email')
    .lean();

  if (!employee) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication account no longer exists');
  }

  req.user = {
    id: employee._id.toString(),
    name: employee.name,
    email: employee.email,
  };
  next();
});

module.exports = authenticate;

