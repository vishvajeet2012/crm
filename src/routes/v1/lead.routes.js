'use strict';

const express = require('express');
const leadController = require('../../controllers/lead.controller');
const authenticate = require('../../middleware/auth.middleware');
const validate = require('../../middleware/validate.middleware');
const asyncHandler = require('../../utils/async-handler');
const HTTP_STATUS = require('../../constants/http-status');
const {
  publicLeadLimiter,
  claimLimiter,
} = require('../../middleware/rate-limit.middleware');
const {
  createLeadSchema,
  unclaimedQuerySchema,
  myLeadsQuerySchema,
  leadIdParamSchema,
  emptyBodySchema,
} = require('../../validators/lead.validator');

const router = express.Router();

router.post(
  '/',
  publicLeadLimiter,
  validate({ body: createLeadSchema }),
  asyncHandler(leadController.create),
);

router.get(
  '/unclaimed',
  authenticate,
  validate({ query: unclaimedQuerySchema }),
  asyncHandler(leadController.listUnclaimed),
);

router.get(
  '/my-leads',
  authenticate,
  validate({ query: myLeadsQuerySchema }),
  asyncHandler(leadController.listMine),
);

router.patch(
  '/:id/claim',
  claimLimiter,
  authenticate,
  validate(
    { params: leadIdParamSchema },
    { statusCode: HTTP_STATUS.BAD_REQUEST },
  ),
  validate({ body: emptyBodySchema }),
  asyncHandler(leadController.claim),
);

module.exports = router;

