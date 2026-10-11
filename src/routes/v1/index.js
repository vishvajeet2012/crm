'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const leadRoutes = require('./lead.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);

module.exports = router;

