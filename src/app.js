'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const createCorsOptions = require('./config/cors');
const apiRoutes = require('./routes');
const notFound = require('./middleware/not-found.middleware');
const errorHandler = require('./middleware/error.middleware');
const ApiResponse = require('./utils/api-response');
const HTTP_STATUS = require('./constants/http-status');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet());
app.use(cors(createCorsOptions()));
app.use(express.json({ limit: env.JSON_BODY_LIMIT, strict: true }));

if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => {
  res.status(HTTP_STATUS.OK).json(
    new ApiResponse('Service is healthy', {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  );
});

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

