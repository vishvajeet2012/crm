'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const TEST_JWT_SECRET = 'integration-test-secret-that-is-long-enough-for-hs256';

const DEFAULT_TEST_ENV = Object.freeze({
  NODE_ENV: 'test',
  PORT: '3001',
  JWT_SECRET: TEST_JWT_SECRET,
  JWT_EXPIRES_IN: '1h',
  BCRYPT_SALT_ROUNDS: '10',
  CORS_ORIGIN: 'http://localhost:3000',
  TRUST_PROXY: 'false',
  GLOBAL_RATE_LIMIT_MAX: '10000',
  GLOBAL_RATE_LIMIT_WINDOW_MS: '900000',
  REGISTER_RATE_LIMIT_MAX: '10000',
  REGISTER_RATE_LIMIT_WINDOW_MS: '3600000',
  LOGIN_RATE_LIMIT_MAX: '10000',
  LOGIN_RATE_LIMIT_WINDOW_MS: '900000',
  PUBLIC_LEAD_RATE_LIMIT_MAX: '10000',
  PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS: '3600000',
  CLAIM_RATE_LIMIT_MAX: '10000',
  CLAIM_RATE_LIMIT_WINDOW_MS: '60000',
});

let fixtureSequence = 0;

function configureTestEnvironment(overrides = {}) {
  const values = { ...DEFAULT_TEST_ENV, ...overrides };

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = String(value);
  }
}

function loadExpressApp() {
  const appModule = require(path.resolve(__dirname, '../src/app'));
  const app = appModule && (appModule.default || appModule.app || appModule);

  assert.equal(
    typeof app,
    'function',
    'src/app.js must export the configured Express application without starting a server',
  );

  return app;
}

async function createTestContext(options = {}) {
  configureTestEnvironment(options.env);

  let mongoServer;

  try {
    mongoServer = await MongoMemoryServer.create({
      instance: { dbName: options.dbName || 'fastor7_crm_test' },
    });
  } catch (error) {
    throw new Error(
      `Unable to start mongodb-memory-server. The MongoDB binary may be unavailable in this environment: ${error.message}`,
      { cause: error },
    );
  }

  process.env.MONGODB_URI = mongoServer.getUri();

  try {
    const app = loadExpressApp();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    await mongoose.connect(process.env.MONGODB_URI);
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init()),
    );

    return {
      app,
      agent: request(app),
      mongoServer,
      mongoUri: process.env.MONGODB_URI,
    };
  } catch (error) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoServer.stop();
    throw error;
  }
}

async function stopTestContext(context) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (context && context.mongoServer) {
    await context.mongoServer.stop();
  }
}

async function clearDatabase() {
  assert.equal(
    mongoose.connection.readyState,
    1,
    'The test database must be connected before it can be cleared',
  );

  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
}

function employeeFixture(overrides = {}) {
  fixtureSequence += 1;

  return {
    name: `Counselor ${fixtureSequence}`,
    email: `counselor${fixtureSequence}@example.com`,
    password: 'StrongPass123!',
    ...overrides,
  };
}

function leadFixture(overrides = {}) {
  fixtureSequence += 1;

  return {
    name: `Student ${fixtureSequence}`,
    email: `student${fixtureSequence}@example.com`,
    phone: '+91-9876543210',
    courseInterest: 'Node.js Backend Development',
    age: 22,
    message: 'Please share the next available batch details.',
    ...overrides,
  };
}

function responseData(response) {
  return response.body && response.body.data;
}

function employeeFromResponse(response) {
  const data = responseData(response);
  return data && (data.employee || data);
}

function tokenFromResponse(response) {
  const data = responseData(response);
  return data && data.token;
}

function leadFromResponse(response) {
  const data = responseData(response);
  return data && (data.lead || data);
}

async function registerEmployee(agent, overrides = {}) {
  const credentials = employeeFixture(overrides);
  const response = await agent
    .post('/api/v1/auth/register')
    .send(credentials);

  assert.equal(
    response.status,
    201,
    `Employee registration failed: ${JSON.stringify(response.body)}`,
  );

  return { credentials, response, employee: employeeFromResponse(response) };
}

async function loginEmployee(agent, credentials) {
  const response = await agent.post('/api/v1/auth/login').send({
    email: credentials.email,
    password: credentials.password,
  });

  assert.equal(
    response.status,
    200,
    `Employee login failed: ${JSON.stringify(response.body)}`,
  );

  const token = tokenFromResponse(response);
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 0);

  return { response, token, employee: employeeFromResponse(response) };
}

async function registerAndLogin(agent, overrides = {}) {
  const registered = await registerEmployee(agent, overrides);
  const loggedIn = await loginEmployee(agent, registered.credentials);

  return {
    credentials: registered.credentials,
    registrationResponse: registered.response,
    loginResponse: loggedIn.response,
    employee: loggedIn.employee || registered.employee,
    token: loggedIn.token,
  };
}

async function createPublicLead(agent, overrides = {}) {
  const payload = leadFixture(overrides);
  const response = await agent.post('/api/v1/leads').send(payload);

  assert.equal(
    response.status,
    201,
    `Public lead creation failed: ${JSON.stringify(response.body)}`,
  );

  return { payload, response, lead: leadFromResponse(response) };
}

function bearer(token) {
  return `Bearer ${token}`;
}

module.exports = {
  TEST_JWT_SECRET,
  bearer,
  clearDatabase,
  configureTestEnvironment,
  createPublicLead,
  createTestContext,
  employeeFixture,
  employeeFromResponse,
  leadFixture,
  leadFromResponse,
  loginEmployee,
  registerAndLogin,
  registerEmployee,
  responseData,
  stopTestContext,
  tokenFromResponse,
};
