'use strict';

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { after, before, beforeEach, describe, test } = require('node:test');
const {
  bearer,
  clearDatabase,
  createPublicLead,
  createTestContext,
  leadFixture,
  leadFromResponse,
  registerAndLogin,
  stopTestContext,
} = require('./setup');

function idOf(document) {
  return String(document._id || document.id);
}

function expectPaginatedLeadResponse(response) {
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.data));
  assert.ok(response.body.meta);
  assert.equal(typeof response.body.meta.page, 'number');
  assert.equal(typeof response.body.meta.limit, 'number');
  assert.equal(typeof response.body.meta.total, 'number');
  assert.equal(typeof response.body.meta.totalPages, 'number');
}

describe('Lead integration', () => {
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

  test('allows an unauthenticated student to create an unclaimed lead', async () => {
    const payload = leadFixture({
      name: '  Priya Singh  ',
      email: 'PRIYA@Example.COM',
      courseInterest: '  Node.js Backend Development  ',
    });

    const response = await context.agent.post('/api/v1/leads').send(payload);

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);

    const lead = leadFromResponse(response);
    assert.ok(lead);
    assert.equal(lead.name, 'Priya Singh');
    assert.equal(lead.email, 'priya@example.com');
    assert.equal(lead.status, 'unclaimed');
    assert.equal(lead.claimedBy, null);
    assert.equal(lead.claimedAt, null);

    const Lead = require('../src/models/lead.model');
    const storedLead = await Lead.findById(idOf(lead)).lean();
    assert.equal(storedLead.status, 'unclaimed');
    assert.equal(storedLead.claimedBy, null);
    assert.equal(storedLead.claimedAt, null);
  });

  test('rejects malformed and unauthorized public lead payloads', async () => {
    const invalidPayloads = [
      leadFixture({ email: 'not-an-email' }),
      leadFixture({ name: undefined }),
      leadFixture({ age: -1 }),
      leadFixture({ age: 999 }),
      leadFixture({ status: 'claimed' }),
      leadFixture({ claimedBy: new mongoose.Types.ObjectId().toString() }),
      leadFixture({ claimedAt: new Date().toISOString() }),
      leadFixture({ unexpectedField: 'must be rejected' }),
    ];

    for (const payload of invalidPayloads) {
      const response = await context.agent.post('/api/v1/leads').send(payload);
      assert.equal(
        response.status,
        422,
        `Expected payload to be rejected: ${JSON.stringify(payload)}; response=${JSON.stringify(response.body)}`,
      );
      assert.equal(response.body.success, false);
    }

    const Lead = require('../src/models/lead.model');
    assert.equal(await Lead.countDocuments({}), 0);
  });

  test('returns 413 for a JSON body above the configured limit', async () => {
    const response = await context.agent.post('/api/v1/leads').send({
      ...leadFixture(),
      message: 'x'.repeat(110 * 1024),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(response.body, {
      success: false,
      message: 'Request body exceeds the configured size limit',
    });
  });

  test('requires a valid JWT to list unclaimed and owned leads', async () => {
    const unclaimedResponse = await context.agent.get(
      '/api/v1/leads/unclaimed',
    );
    const myLeadsResponse = await context.agent.get('/api/v1/leads/my-leads');

    assert.equal(unclaimedResponse.status, 401);
    assert.equal(unclaimedResponse.body.success, false);
    assert.equal(myLeadsResponse.status, 401);
    assert.equal(myLeadsResponse.body.success, false);
  });

  test('lets two employees see the same lead before it is claimed', async () => {
    const employeeA = await registerAndLogin(context.agent, {
      email: 'employee-a@example.com',
    });
    const employeeB = await registerAndLogin(context.agent, {
      email: 'employee-b@example.com',
    });
    const { lead } = await createPublicLead(context.agent);

    const [responseA, responseB] = await Promise.all([
      context.agent
        .get('/api/v1/leads/unclaimed')
        .set('Authorization', bearer(employeeA.token)),
      context.agent
        .get('/api/v1/leads/unclaimed')
        .set('Authorization', bearer(employeeB.token)),
    ]);

    expectPaginatedLeadResponse(responseA);
    expectPaginatedLeadResponse(responseB);
    assert.deepEqual(responseA.body.data.map(idOf), [idOf(lead)]);
    assert.deepEqual(responseB.body.data.map(idOf), [idOf(lead)]);
  });

  test('enforces the complete claim ownership lifecycle', async () => {
    const employeeA = await registerAndLogin(context.agent, {
      name: 'Employee A',
      email: 'claim-a@example.com',
    });
    const employeeB = await registerAndLogin(context.agent, {
      name: 'Employee B',
      email: 'claim-b@example.com',
    });
    const { lead } = await createPublicLead(context.agent);
    const leadId = idOf(lead);
    const employeeAId = idOf(employeeA.employee);

    const claimResponse = await context.agent
      .patch(`/api/v1/leads/${leadId}/claim`)
      .set('Authorization', bearer(employeeA.token))
      .send({});

    assert.equal(claimResponse.status, 200);
    assert.equal(claimResponse.body.success, true);
    const claimedLead = leadFromResponse(claimResponse);
    assert.equal(claimedLead.status, 'claimed');
    assert.equal(String(claimedLead.claimedBy), employeeAId);
    assert.ok(claimedLead.claimedAt);

    const [unclaimed, myLeadsA, myLeadsB] = await Promise.all([
      context.agent
        .get('/api/v1/leads/unclaimed')
        .set('Authorization', bearer(employeeA.token)),
      context.agent
        .get('/api/v1/leads/my-leads')
        .set('Authorization', bearer(employeeA.token)),
      context.agent
        .get('/api/v1/leads/my-leads')
        .set('Authorization', bearer(employeeB.token)),
    ]);

    expectPaginatedLeadResponse(unclaimed);
    expectPaginatedLeadResponse(myLeadsA);
    expectPaginatedLeadResponse(myLeadsB);
    assert.equal(unclaimed.body.data.some((item) => idOf(item) === leadId), false);
    assert.deepEqual(myLeadsA.body.data.map(idOf), [leadId]);
    assert.equal(myLeadsB.body.data.some((item) => idOf(item) === leadId), false);

    const conflict = await context.agent
      .patch(`/api/v1/leads/${leadId}/claim`)
      .set('Authorization', bearer(employeeB.token))
      .send({});

    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.success, false);
    assert.equal(Object.hasOwn(conflict.body, 'data'), false);
    assert.equal(JSON.stringify(conflict.body).includes(employeeAId), false);

    const repeatByOwner = await context.agent
      .patch(`/api/v1/leads/${leadId}/claim`)
      .set('Authorization', bearer(employeeA.token))
      .send({});
    assert.equal(repeatByOwner.status, 409);

    const Lead = require('../src/models/lead.model');
    const finalLead = await Lead.findById(leadId).lean();
    assert.equal(String(finalLead.claimedBy), employeeAId);
  });

  test('does not allow request body ownership to override the JWT identity', async () => {
    const employeeA = await registerAndLogin(context.agent, {
      email: 'body-owner-a@example.com',
    });
    const employeeB = await registerAndLogin(context.agent, {
      email: 'body-owner-b@example.com',
    });
    const { lead } = await createPublicLead(context.agent);

    const response = await context.agent
      .patch(`/api/v1/leads/${idOf(lead)}/claim`)
      .set('Authorization', bearer(employeeA.token))
      .send({ claimedBy: idOf(employeeB.employee) });

    assert.ok(
      response.status === 200 || response.status === 400 || response.status === 422,
      `The API must either reject an ownership field or ignore it safely: ${JSON.stringify(response.body)}`,
    );

    const Lead = require('../src/models/lead.model');
    const storedLead = await Lead.findById(idOf(lead)).lean();

    if (response.status === 200) {
      assert.equal(String(storedLead.claimedBy), idOf(employeeA.employee));
    } else {
      assert.equal(storedLead.status, 'unclaimed');
      assert.equal(storedLead.claimedBy, null);
    }
  });

  test('returns 400 for an invalid lead id and 404 for a missing valid id', async () => {
    const employee = await registerAndLogin(context.agent);

    const invalidId = await context.agent
      .patch('/api/v1/leads/not-a-valid-object-id/claim')
      .set('Authorization', bearer(employee.token))
      .send({});

    assert.equal(invalidId.status, 400);
    assert.equal(invalidId.body.success, false);

    const nonexistentId = new mongoose.Types.ObjectId().toString();
    const missingLead = await context.agent
      .patch(`/api/v1/leads/${nonexistentId}/claim`)
      .set('Authorization', bearer(employee.token))
      .send({});

    assert.equal(missingLead.status, 404);
    assert.equal(missingLead.body.success, false);
  });

  test('filters unclaimed leads by normalized course and age range', async () => {
    const employee = await registerAndLogin(context.agent);
    const nodeYoung = await createPublicLead(context.agent, {
      courseInterest: 'Node.js',
      age: 20,
    });
    const nodeOlder = await createPublicLead(context.agent, {
      courseInterest: 'Node.js',
      age: 35,
    });
    await createPublicLead(context.agent, {
      courseInterest: 'Data Science',
      age: 21,
    });

    const courseResponse = await context.agent
      .get('/api/v1/leads/unclaimed')
      .query({ courseInterest: '  NODE.JS  ' })
      .set('Authorization', bearer(employee.token));

    expectPaginatedLeadResponse(courseResponse);
    assert.deepEqual(
      new Set(courseResponse.body.data.map(idOf)),
      new Set([idOf(nodeYoung.lead), idOf(nodeOlder.lead)]),
    );

    const ageResponse = await context.agent
      .get('/api/v1/leads/unclaimed')
      .query({ courseInterest: 'Node.js', minAge: 18, maxAge: 25 })
      .set('Authorization', bearer(employee.token));

    expectPaginatedLeadResponse(ageResponse);
    assert.deepEqual(ageResponse.body.data.map(idOf), [idOf(nodeYoung.lead)]);

    const invalidRange = await context.agent
      .get('/api/v1/leads/unclaimed')
      .query({ minAge: 40, maxAge: 20 })
      .set('Authorization', bearer(employee.token));
    assert.equal(invalidRange.status, 422);
  });

  test('returns correct pagination metadata and non-overlapping pages', async () => {
    const employee = await registerAndLogin(context.agent);

    for (let index = 0; index < 5; index += 1) {
      await createPublicLead(context.agent, {
        name: `Pagination Student ${index}`,
        email: `pagination-${index}@example.com`,
      });
    }

    const [pageOne, pageTwo] = await Promise.all([
      context.agent
        .get('/api/v1/leads/unclaimed')
        .query({ page: 1, limit: 2 })
        .set('Authorization', bearer(employee.token)),
      context.agent
        .get('/api/v1/leads/unclaimed')
        .query({ page: 2, limit: 2 })
        .set('Authorization', bearer(employee.token)),
    ]);

    expectPaginatedLeadResponse(pageOne);
    expectPaginatedLeadResponse(pageTwo);
    assert.deepEqual(pageOne.body.meta, {
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    assert.deepEqual(pageTwo.body.meta, {
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    assert.equal(pageOne.body.data.length, 2);
    assert.equal(pageTwo.body.data.length, 2);

    const firstPageIds = new Set(pageOne.body.data.map(idOf));
    assert.equal(
      pageTwo.body.data.some((lead) => firstPageIds.has(idOf(lead))),
      false,
    );
  });

  test('uses _id descending as the deterministic tie-breaker', async () => {
    const employee = await registerAndLogin(context.agent);
    const Lead = require('../src/models/lead.model');
    const createdAt = new Date('2025-01-01T12:00:00.000Z');
    const ids = [
      new mongoose.Types.ObjectId('67752e400000000000000001'),
      new mongoose.Types.ObjectId('67752e400000000000000002'),
      new mongoose.Types.ObjectId('67752e400000000000000003'),
    ];

    await Lead.insertMany(
      ids.map((id, index) => ({
        _id: id,
        name: `Tied Student ${index}`,
        email: `tied-${index}@example.com`,
        courseInterest: 'Node.js',
        age: 20 + index,
        status: 'unclaimed',
        claimedBy: null,
        claimedAt: null,
        createdAt,
        updatedAt: createdAt,
      })),
    );

    const response = await context.agent
      .get('/api/v1/leads/unclaimed')
      .query({ page: 1, limit: 10 })
      .set('Authorization', bearer(employee.token));

    expectPaginatedLeadResponse(response);
    assert.deepEqual(
      response.body.data.map(idOf),
      [...ids].reverse().map(String),
    );
  });

  test('rejects invalid pagination and age query values', async () => {
    const employee = await registerAndLogin(context.agent);
    const invalidQueries = [
      { page: 0 },
      { page: 'one' },
      { page: '9'.repeat(400) },
      { limit: 0 },
      { limit: 101 },
      { minAge: -1 },
      { maxAge: 999 },
    ];

    for (const query of invalidQueries) {
      const response = await context.agent
        .get('/api/v1/leads/unclaimed')
        .query(query)
        .set('Authorization', bearer(employee.token));
      assert.equal(
        response.status,
        422,
        `Expected query to be rejected: ${JSON.stringify(query)}; response=${JSON.stringify(response.body)}`,
      );
    }
  });
});
