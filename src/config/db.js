'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const Employee = require('../models/employee.model');
const Lead = require('../models/lead.model');

async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri);
 
    await Promise.all([Employee.init(), Lead.init()]);
    return mongoose.connection;
  } catch (error) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    throw error;
  }
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
};

