'use strict';

const path = require('node:path');
const process = require('node:process');
const mongoose = require('mongoose');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
  quiet: true,
});

const DEFAULT_EXPLAIN_LIMIT = 25;
const DEFAULT_MIN_AGE = 18;
const DEFAULT_MAX_AGE = 35;

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function collectPlanDetails(value, details = { stages: new Set(), indexNames: new Set() }) {
  if (!value || typeof value !== 'object') {
    return details;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPlanDetails(entry, details);
    }
    return details;
  }

  if (typeof value.stage === 'string') {
    details.stages.add(value.stage);
  }

  if (typeof value.indexName === 'string') {
    details.indexNames.add(value.indexName);
  }

  for (const child of Object.values(value)) {
    collectPlanDetails(child, details);
  }

  return details;
}

function stringifyForDisplay(value) {
  return JSON.stringify(value, (_key, item) => {
    if (item instanceof mongoose.Types.ObjectId) {
      return item.toHexString();
    }
    return item;
  });
}

function printIndexes(indexes) {
  console.log('\nExisting indexes on the leads collection');

  if (indexes.length === 0) {
    console.log('  No indexes were returned.');
    return;
  }

  for (const index of indexes) {
    console.log(`\n- ${index.name}`);
    console.log(`  keys: ${JSON.stringify(index.key)}`);
    console.log(`  unique: ${Boolean(index.unique)}`);

    if (index.partialFilterExpression) {
      console.log(`  partialFilterExpression: ${JSON.stringify(index.partialFilterExpression)}`);
    }

    if (index.sparse) {
      console.log('  sparse: true');
    }
  }
}

function printExecutionSummary(explanation) {
  const queryPlanner = explanation.queryPlanner || {};
  const executionStats = explanation.executionStats || {};
  const winningPlan = queryPlanner.winningPlan || null;
  const planDetails = collectPlanDetails({
    winningPlan,
    executionStages: executionStats.executionStages,
  });
  const stages = [...planDetails.stages];
  const indexNames = [...planDetails.indexNames];

  console.log('Winning plan:');
  console.dir(winningPlan, { depth: null, colors: false });
  console.log(`Plan stages: ${stages.length > 0 ? stages.join(' -> ') : 'not reported'}`);
  console.log(`Indexes used: ${indexNames.length > 0 ? indexNames.join(', ') : 'none reported'}`);
  console.log(`Contains IXSCAN: ${stages.includes('IXSCAN')}`);
  console.log(`Contains COLLSCAN: ${stages.includes('COLLSCAN')}`);
  console.log(`Contains explicit SORT: ${stages.includes('SORT')}`);
  console.log(`nReturned: ${executionStats.nReturned ?? 'not reported'}`);
  console.log(`totalKeysExamined: ${executionStats.totalKeysExamined ?? 'not reported'}`);
  console.log(`totalDocsExamined: ${executionStats.totalDocsExamined ?? 'not reported'}`);
  console.log(`executionTimeMillis: ${executionStats.executionTimeMillis ?? 'not reported'}`);

  if (queryPlanner.rejectedPlans) {
    console.log(`Rejected plans: ${queryPlanner.rejectedPlans.length}`);
  }
}

async function explainQuery(collection, { name, filter, sort, limit }) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(name);
  console.log(`Filter: ${stringifyForDisplay(filter)}`);
  console.log(`Sort: ${JSON.stringify(sort)}`);
  console.log(`Limit: ${limit}`);

  const explanation = await collection
    .find(filter)
    .sort(sort)
    .limit(limit)
    .explain('executionStats');

  printExecutionSummary(explanation);
}

function parseEmployeeId(value) {
  if (!value) {
    return null;
  }

  if (!/^[a-f\d]{24}$/i.test(value)) {
    throw new Error('VERIFY_EMPLOYEE_ID must be a 24-character hexadecimal ObjectId.');
  }

  return new mongoose.Types.ObjectId(value);
}

async function chooseRepresentativeValues(leadsCollection) {
  const configuredCourse = process.env.VERIFY_COURSE_INTEREST?.trim().toLowerCase();
  const sampleCourseLead = configuredCourse
    ? null
    : await leadsCollection.findOne(
        { status: 'unclaimed', courseInterest: { $type: 'string' } },
        { projection: { courseInterest: 1 } },
      );
  const courseInterest = configuredCourse || sampleCourseLead?.courseInterest || 'web development';

  const configuredEmployeeId = parseEmployeeId(process.env.VERIFY_EMPLOYEE_ID);
  const sampleClaimedLead = configuredEmployeeId
    ? null
    : await leadsCollection.findOne(
        { status: 'claimed', claimedBy: { $ne: null } },
        { projection: { claimedBy: 1 } },
      );
  const employeeId =
    configuredEmployeeId || sampleClaimedLead?.claimedBy || new mongoose.Types.ObjectId();

  return { courseInterest, employeeId };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.EC2_MONGO_URI;

  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI is required. Point it at a safe database containing representative lead data.',
    );
  }

  if (!process.env.MONGODB_URI && process.env.EC2_MONGO_URI) {
    console.warn(
      'Warning: using legacy EC2_MONGO_URI. Rename it to MONGODB_URI to match the application configuration.',
    );
  }

  const databaseName = process.env.VERIFY_INDEX_DATABASE?.trim();
  const connectOptions = {
    serverSelectionTimeoutMS: readPositiveInteger(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      10_000,
    ),
  };

  if (databaseName) {
    connectOptions.dbName = databaseName;
  }

  await mongoose.connect(mongoUri, connectOptions);

  const database = mongoose.connection.db;
  const leadsCollection = database.collection('leads');
  const explainLimit = readPositiveInteger(process.env.VERIFY_EXPLAIN_LIMIT, DEFAULT_EXPLAIN_LIMIT);
  const minAge = readPositiveInteger(process.env.VERIFY_MIN_AGE, DEFAULT_MIN_AGE);
  const maxAge = readPositiveInteger(process.env.VERIFY_MAX_AGE, DEFAULT_MAX_AGE);

  if (minAge > maxAge) {
    throw new Error('VERIFY_MIN_AGE cannot be greater than VERIFY_MAX_AGE.');
  }

  console.log(`Connected to MongoDB database: ${database.databaseName}`);
  console.log('This script is read-only: it lists indexes and explains representative queries.');

  const indexes = await leadsCollection.indexes();
  printIndexes(indexes);

  const { courseInterest, employeeId } = await chooseRepresentativeValues(leadsCollection);

  console.log('\nRepresentative values');
  console.log(`  courseInterest: ${courseInterest}`);
  console.log(`  employeeId: ${employeeId.toString()}`);
  console.log(
    '  Set VERIFY_COURSE_INTEREST or VERIFY_EMPLOYEE_ID to analyze a different data slice.',
  );

  const queries = [
    {
      name: '1. General unclaimed-leads query',
      filter: { status: 'unclaimed', claimedBy: null },
      sort: { createdAt: -1, _id: -1 },
      limit: explainLimit,
    },
    {
      name: '2. Course-filtered unclaimed-leads query',
      filter: { status: 'unclaimed', claimedBy: null, courseInterest },
      sort: { createdAt: -1, _id: -1 },
      limit: explainLimit,
    },
    {
      name: '3. Authenticated employee my-leads query',
      filter: { claimedBy: employeeId, status: 'claimed' },
      sort: { claimedAt: -1, _id: -1 },
      limit: explainLimit,
    },
    {
      name: '4. Course and age range ESR demonstration',
      filter: {
        status: 'unclaimed',
        claimedBy: null,
        courseInterest,
        age: { $gte: minAge, $lte: maxAge },
      },
      sort: { createdAt: -1, _id: -1 },
      limit: explainLimit,
    },
  ];

  for (const query of queries) {
    await explainQuery(leadsCollection, query);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('How to interpret these results');
  console.log('- IXSCAN means an index supplied candidate keys; FETCH may still inspect documents.');
  console.log('- COLLSCAN means MongoDB scanned the collection for that execution.');
  console.log('- An explicit SORT stage means the selected plan did not fully provide the sort order.');
  console.log('- Lower examined-to-returned ratios are generally preferable for representative data.');
  console.log(
    '- Small collections may legitimately use COLLSCAN; planner choices vary with data distribution and MongoDB version.',
  );
  console.log(
    '- The trailing age range in the ESR demonstration can still scan extra keys because the sort fields precede it.',
  );
  console.log('- No hint() is used; MongoDB remains free to choose the winning plan.');
}

main()
  .catch((error) => {
    console.error(`Index verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
