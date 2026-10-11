'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

const JWT_ALGORITHM = 'HS256';

function signToken(employeeId) {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_EXPIRES_IN,
    subject: employeeId.toString(),
  });
}

function verifyToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
  });

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !Number.isInteger(payload.exp)
  ) {
    throw new jwt.JsonWebTokenError('JWT must contain a numeric expiration claim');
  }

  return payload;
}

module.exports = {
  signToken,
  verifyToken,
  JWT_ALGORITHM,
};

