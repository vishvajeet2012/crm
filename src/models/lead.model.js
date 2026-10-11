'use strict';

const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
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
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    courseInterest: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
    },
    age: {
      type: Number,
      min: 10,
      max: 120,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['unclaimed', 'claimed'],
      default: 'unclaimed',
      required: true,
    },
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

leadSchema.pre('validate', function validateOwnershipState() {
  if (this.status === 'unclaimed' && (this.claimedBy !== null || this.claimedAt !== null)) {
    this.invalidate('status', 'Unclaimed leads cannot have an owner or claim timestamp');
  }

  if (this.status === 'claimed' && (!this.claimedBy || !this.claimedAt)) {
    this.invalidate('status', 'Claimed leads require an owner and claim timestamp');
  }
});

leadSchema.index(
  { status: 1, createdAt: -1, _id: -1 },
  { name: 'unclaimed_by_created_at' },
);

leadSchema.index(
  { status: 1, courseInterest: 1, createdAt: -1, _id: -1 },
  { name: 'unclaimed_by_course_created_at' },
);

leadSchema.index(
  { claimedBy: 1, status: 1, claimedAt: -1, _id: -1 },
  { name: 'claimed_by_employee_claimed_at' },
);

leadSchema.index(
  {
    status: 1,
    courseInterest: 1,
    createdAt: -1,
    _id: -1,
    age: 1,
  },
  { name: 'unclaimed_course_sort_age_esr_demo' },
);

module.exports = mongoose.model('Lead', leadSchema);

