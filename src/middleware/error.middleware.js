'use strict';

const env = require('../config/env');
const ApiError = require('../utils/api-error');
const HTTP_STATUS = require('../constants/http-status');

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && error?.status === 400)) {
    return new ApiError(HTTP_STATUS.BAD_REQUEST, 'Malformed JSON request body');
  }

  if (error?.type === 'entity.too.large' || error?.status === HTTP_STATUS.PAYLOAD_TOO_LARGE) {
    return new ApiError(
      HTTP_STATUS.PAYLOAD_TOO_LARGE,
      'Request body exceeds the configured size limit',
    );
  }

  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    const message =
      error.status === HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE
        ? 'Unsupported request encoding or media type'
        : 'Request could not be processed';
    return new ApiError(error.status, message);
  }

  if (error?.code === 11000) {
    return new ApiError(HTTP_STATUS.CONFLICT, 'An account with this email already exists');
  }

  if (error?.name === 'CastError') {
    return new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid identifier');
  }

  if (error?.name === 'ValidationError') {
    const details = Object.values(error.errors || {}).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    return new ApiError(
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      'Database validation failed',
      details,
    );
  }

  return new ApiError(
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    'Internal server error',
  );
}

function errorHandler(error, req, res, next) {
  const normalized = normalizeError(error);

  if (normalized.statusCode >= 500 && env.NODE_ENV !== 'test') {
    // Request bodies and headers are deliberately not logged, avoiding credential leaks.
    console.error(error?.stack || error);
  }

  const response = {
    success: false,
    message: normalized.message,
  };

  if (normalized.details?.length) {
    response.errors = normalized.details;
  }

  if (env.NODE_ENV === 'development' && normalized.statusCode >= 500) {
    response.stack = error?.stack;
  }

  res.status(normalized.statusCode).json(response);
}

module.exports = errorHandler;

