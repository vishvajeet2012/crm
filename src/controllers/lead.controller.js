'use strict';

const leadService = require('../services/lead.service');
const ApiResponse = require('../utils/api-response');
const HTTP_STATUS = require('../constants/http-status');

async function create(req, res) {
  const lead = await leadService.createLead(req.validated.body);
  res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse('Lead created successfully', lead));
}

async function listUnclaimed(req, res) {
  const { leads, meta } = await leadService.getUnclaimedLeads(req.validated.query);
  res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse('Unclaimed leads retrieved successfully', leads, meta));
}

async function listMine(req, res) {
  const { leads, meta } = await leadService.getEmployeeLeads(
    req.user.id,
    req.validated.query,
  );
  res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse('Claimed leads retrieved successfully', leads, meta));
}

async function claim(req, res) {
  const lead = await leadService.claimLead(req.validated.params.id, req.user.id);
  res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse('Lead claimed successfully', lead));
}

module.exports = {
  create,
  listUnclaimed,
  listMine,
  claim,
};

