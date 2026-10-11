'use strict';

const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, test } = require('node:test');
const jwt = require('jsonwebtoken');
const {
  TEST_JWT_SECRET,
  clearDatabase,
  createTestContext,
  employeeFromResponse,
  registerEmployee,
  stopTestContext,
  tokenFromResponse,
} = require('./setup');

describe('Authentication integration', () => {
  let context;

  before(async () => {
    context = await createTestContext();
  });

  after(async () => {
    await stopTestContext(context);
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  test('registers an employee and never exposes password data', async () => {
    const response = await context.agent
      .post('/api/v1/auth/register')
      .send({
        name: '  Rahul Sharma  ',
        email: 'Rahul.Sharma@Example.COM',
        password: 'StrongPass123!',
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);

    const employee = employeeFromResponse(response);
    assert.ok(employee);
    assert.equal(employee.name, 'Rahul Sharma');
    assert.equal(employee.email, 'rahul.sharma@example.com');
    assert.ok(employee._id || employee.id);
    assert.equal(Object.hasOwn(employee, 'password'), false);
    assert.equal(Object.hasOwn(employee, 'passwordHash'), false);

    const Employee = require('../src/models/employee.model');
    const storedEmployee = await Employee.findOne({
      email: 'rahul.sharma@example.com',
    }).select('+passwordHash');

    assert.ok(storedEmployee);
    assert.notEqual(storedEmployee.passwordHash, 'StrongPass123!');
    assert.ok(storedEmployee.passwordHash);
  });

  test('returns 409 for a duplicate email after normalization', async () => {
    await registerEmployee(context.agent, {
      email: 'duplicate@example.com',
    });

    const response = await context.agent
      .post('/api/v1/auth/register')
      .send({
        name: 'Duplicate Counselor',
        email: '  DUPLICATE@EXAMPLE.COM  ',
        password: 'AnotherStrong123!',
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    assert.equal(typeof response.body.message, 'string');
    assert.equal(Object.hasOwn(response.body, 'passwordHash'), false);

    const Employee = require('../src/models/employee.model');
    assert.equal(await Employee.countDocuments({}), 1);
  });

  test('logs in with a normalized email and returns a valid expiring JWT', async () => {
    const registered = await registerEmployee(context.agent, {
      name: 'Aman Verma',
      email: 'aman.verma@example.com',
    });

    const response = await context.agent.post('/api/v1/auth/login').send({
      email: 'AMAN.VERMA@EXAMPLE.COM',
      password: registered.credentials.password,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const token = tokenFromResponse(response);
    assert.equal(typeof token, 'string');

    const decoded = jwt.verify(token, TEST_JWT_SECRET, {
      algorithms: ['HS256'],
    });

    assert.ok(decoded.sub || decoded.employeeId || decoded.id);
    assert.equal(typeof decoded.iat, 'number');
    assert.equal(typeof decoded.exp, 'number');
    assert.ok(decoded.exp > decoded.iat);

    const employee = employeeFromResponse(response);
    assert.equal(employee.email, 'aman.verma@example.com');
    assert.equal(Object.hasOwn(employee, 'passwordHash'), false);
  });

  test('returns 401 for incorrect credentials without leaking details', async () => {
    await registerEmployee(context.agent, {
      email: 'invalid-login@example.com',
    });

    const response = await context.agent.post('/api/v1/auth/login').send({
      email: 'invalid-login@example.com',
      password: 'WrongPassword123!',
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(typeof response.body.message, 'string');
    assert.equal(Object.hasOwn(response.body, 'token'), false);
    assert.equal(Object.hasOwn(response.body, 'data'), false);
  });

  test('rejects a validly signed JWT that has no expiration claim', async () => {
    const registered = await registerEmployee(context.agent, {
      email: 'non-expiring-token@example.com',
    });
    const employeeId = String(registered.employee._id || registered.employee.id);
    const tokenWithoutExpiration = jwt.sign({}, TEST_JWT_SECRET, {
      algorithm: 'HS256',
      subject: employeeId,
      noTimestamp: true,
    });

    const response = await context.agent
      .get('/api/v1/leads/unclaimed')
      .set('Authorization', `Bearer ${tokenWithoutExpiration}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });
});
