'use strict';

const Lead = require('../models/lead.model');
const ApiError = require('../utils/api-error');
const HTTP_STATUS = require('../constants/http-status');

async function createLead(input) {
  const lead = await Lead.create({
    name: input.name,
    email: input.email,
    phone: input.phone,
    courseInterest: input.courseInterest,
    age: input.age,
    message: input.message,
    status: 'unclaimed',
    claimedBy: null,
    claimedAt: null,
  });

  return lead.toObject();
}

function buildAgeFilter(minAge, maxAge) {
  if (minAge === undefined && maxAge === undefined) {
    return undefined;
  }

  return {
    ...(minAge !== undefined ? { $gte: minAge } : {}),
    ...(maxAge !== undefined ? { $lte: maxAge } : {}),
  };
}

function paginationMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

async function getUnclaimedLeads({ page, limit, courseInterest, minAge, maxAge }) {
  const filter = {
    status: 'unclaimed',
    claimedBy: null,
  };

  if (courseInterest !== undefined) {
    filter.courseInterest = courseInterest;
  }

  const age = buildAgeFilter(minAge, maxAge);
  if (age) {
    filter.age = age;
  }

  const skip = (page - 1) * limit;
  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  return {
    leads,
    meta: paginationMeta(page, limit, total),
  };
}

async function getEmployeeLeads(employeeId, { page, limit }) {
  const filter = {
    claimedBy: employeeId,
    status: 'claimed',
  };
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort({ claimedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  return {
    leads,
    meta: paginationMeta(page, limit, total),
  };
}

async function claimLead(leadId, employeeId) {
  const claimedAt = new Date();
  const claimedLead = await Lead.findOneAndUpdate(
    {
      _id: leadId,
      status: 'unclaimed',
      claimedBy: null,
    },
    {
      $set: {
        status: 'claimed',
        claimedBy: employeeId,
        claimedAt,
      },
    },
    {
      new: true,
      runValidators: true,
      context: 'query',
    },
  ).lean();

  if (claimedLead) {
    return claimedLead;
  }

  // This read is only for response classification. It never participates in
  // ownership assignment and deliberately returns no private lead data.
  const exists = await Lead.exists({ _id: leadId });
  if (!exists) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Lead not found');
  }

  throw new ApiError(HTTP_STATUS.CONFLICT, 'Lead already claimed');
}

module.exports = {
  createLead,
  getUnclaimedLeads,
  getEmployeeLeads,
  claimLead,
};

