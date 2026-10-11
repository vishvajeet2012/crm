'use strict';

const ApiError = require('../utils/api-error');
const HTTP_STATUS = require('../constants/http-status');

function notFound(req, res, next) {
  next(new ApiError(HTTP_STATUS.NOT_FOUND, 'Route not found'));
}

module.exports = notFound;

