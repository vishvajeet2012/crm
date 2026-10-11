'use strict';

const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, test } = require('node:test');
const {
  bearer,
  clearDatabase,
  createPublicLead,
  createTestContext,
  registerAndLogin,
  stopTestContext,
} = require('./setup');

function idOf(document) {
  return String(document._id || document.id);
}

describe('Atomic lead claiming', () => {
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

  test('allows exactly one of two simultaneous claim requests to win', async () => {
    const employeeA = await registerAndLogin(context.agent, {
      name: 'Rahul Counselor',
      email: 'rahul.concurrent@example.com',
    });
    const employeeB = await registerAndLogin(context.agent, {
      name: 'Aman Counselor',
      email: 'aman.concurrent@example.com',
    });
    const { lead } = await createPublicLead(context.agent, {
      email: 'concurrent.student@example.com',
    });
    const leadId = idOf(lead);

    const contenders = [
      {
        employeeId: idOf(employeeA.employee),
        email: employeeA.credentials.email,
        token: employeeA.token,
      },
      {
        employeeId: idOf(employeeB.employee),
        email: employeeB.credentials.email,
        token: employeeB.token,
      },
    ];

    const responses = await Promise.all(
      contenders.map((contender) =>
        context.agent
          .patch(`/api/v1/leads/${leadId}/claim`)
          .set('Authorization', bearer(contender.token))
          .send({}),
      ),
    );

    assert.deepEqual(
      responses.map((response) => response.status).sort((a, b) => a - b),
      [200, 409],
    );

    const winnerIndex = responses.findIndex((response) => response.status === 200);
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winner = contenders[winnerIndex];
    const loser = contenders[loserIndex];
    const winningResponse = responses[winnerIndex];
    const losingResponse = responses[loserIndex];

    assert.equal(winningResponse.body.success, true);
    assert.equal(losingResponse.body.success, false);
    assert.equal(Object.hasOwn(losingResponse.body, 'data'), false);

    const Lead = require('../src/models/lead.model');
    const finalLead = await Lead.findById(leadId).lean();

    assert.ok(finalLead);
    assert.equal(finalLead.status, 'claimed');
    assert.equal(String(finalLead.claimedBy), winner.employeeId);
    assert.notEqual(String(finalLead.claimedBy), loser.employeeId);
    assert.ok(finalLead.claimedAt instanceof Date);

    const losingBody = JSON.stringify(losingResponse.body);
    assert.equal(losingBody.includes(winner.email), false);
    assert.equal(losingBody.includes(winner.employeeId), false);
    assert.equal(losingBody.includes('claimedBy'), false);
  });
});
