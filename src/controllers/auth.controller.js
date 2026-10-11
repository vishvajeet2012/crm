'use strict';

const authService = require('../services/auth.service');
const ApiResponse = require('../utils/api-response');
const HTTP_STATUS = require('../constants/http-status');

async function register(req, res) {
  const employee = await authService.registerEmployee(req.validated.body);
  res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse('Employee registered successfully', { employee }));
}

async function login(req, res) {
  const result = await authService.loginEmployee(req.validated.body);
  res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse('Login successful', result));
}

module.exports = {
  register,
  login,
};

