'use strict';

const env = require('./env');
const ApiError = require('../utils/api-error');
const HTTP_STATUS = require('../constants/http-status');

function createCorsOptions() {
  if (env.CORS_ORIGIN === '*') {
    return {
      origin: '*',
      credentials: false,
      optionsSuccessStatus: 204,
    };
  }

  const allowedOrigins = new Set(
    env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  return {
    origin(origin, callback) {
      // Requests from server-to-server clients and tools such as Postman have no Origin.
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new ApiError(HTTP_STATUS.FORBIDDEN, 'Origin is not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

module.exports = createCorsOptions;

