'use strict';

const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, returnedObject) {
        delete returnedObject.passwordHash;
        return returnedObject;
      },
    },
  },
);

employeeSchema.index(
  { email: 1 },
  { unique: true, name: 'uniq_employee_email' },
);

module.exports = mongoose.model('Employee', employeeSchema);

