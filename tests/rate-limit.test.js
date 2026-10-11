'use strict';

const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');
const {
  createTestContext,
  leadFixture,
  stopTestContext,
} = require('./setup');

describe('API rate limiting', () => {
  let context;

  before(async () => {
    context = await createTestContext({
      dbName: 'fastor7_crm_rate_limit_test',
      env: {
        GLOBAL_RATE_LIMIT_MAX: '1000',
        GLOBAL_RATE_LIMIT_WINDOW_MS: '60000',
        PUBLIC_LEAD_RATE_LIMIT_MAX: '2',
        PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS: '60000',
      },
    });
  });

  after(async () => {
    await stopTestContext(context);
  });

  test('returns a consistent 429 response after the public form threshold', async () => {
    const first = await context.agent.post('/api/v1/leads').send(
      leadFixture({ email: 'rate-limit-1@example.com' }),
    );
    const second = await context.agent.post('/api/v1/leads').send(
      leadFixture({ email: 'rate-limit-2@example.com' }),
    );
    const exceeded = await context.agent.post('/api/v1/leads').send(
      leadFixture({ email: 'rate-limit-3@example.com' }),
    );

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(exceeded.status, 429);
    assert.deepEqual(exceeded.body, {
      success: false,
      message: 'Too many requests. Please try again later.',
    });

    assert.ok(
      exceeded.headers.ratelimit || exceeded.headers['ratelimit-limit'],
      'A standard RateLimit header must be present',
    );
    assert.ok(exceeded.headers['retry-after'], 'Retry-After must be present');
    assert.ok(Number(exceeded.headers['retry-after']) > 0);
  });
});
