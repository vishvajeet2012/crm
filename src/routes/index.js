'use strict';

const express = require('express');
const v1Routes = require('./v1');
const { globalApiLimiter } = require('../middleware/rate-limit.middleware');

const router = express.Router();

router.use('/v1', globalApiLimiter, v1Routes);

module.exports = router;

