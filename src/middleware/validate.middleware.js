'use strict';

const ApiError = require('../utils/api-error');
const HTTP_STATUS = require('../constants/http-status');

function formatIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.join('.') || 'request',
    message: issue.message,
  }));
}

function validate(schemas, options = {}) {
  const statusCode = options.statusCode || HTTP_STATUS.UNPROCESSABLE_ENTITY;

  return function validationMiddleware(req, res, next) {
    const validated = {};

    for (const [location, schema] of Object.entries(schemas)) {
      const source = location === 'body' && req[location] === undefined ? {} : req[location];
      const result = schema.safeParse(source);

      if (!result.success) {
        next(
          new ApiError(
            statusCode,
            'Request validation failed',
            formatIssues(result.error.issues),
          ),
        );
        return;
      }

      validated[location] = result.data;
    }

    req.validated = {
      ...(req.validated || {}),
      ...validated,
    };
    next();
  };
}

module.exports = validate;

