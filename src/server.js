'use strict';

const app = require('./app');
const env = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/db');

async function startServer() {
  await connectDatabase();

  let server;
  try {
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(env.PORT);
      const handleStartupError = (error) => reject(error);
      listener.once('error', handleStartupError);
      listener.once('listening', () => {
        listener.off('error', handleStartupError);
        resolve(listener);
      });
    });
  } catch (error) {
    await disconnectDatabase();
    throw error;
  }

  console.log(`CRM API listening on port ${env.PORT}`);

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`${signal} received; shutting down gracefully`);

    const forceExitTimer = setTimeout(() => {
      console.error('Graceful shutdown timed out');
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await disconnectDatabase();
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      console.error('Graceful shutdown failed:', error.message);
      process.exit(1);
    }
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = startServer;

