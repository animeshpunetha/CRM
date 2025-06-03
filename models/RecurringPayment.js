// models/RecurringPayment.js
const mongoose = require('mongoose');

const RecurringPaymentSchema = new mongoose.Schema({
  account: {
    // company name → referencing Account model
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  contact: {
    // contact name → referencing Contact model
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  deal: {
    // deal name → referencing Deal model
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true
  },
  recurringAmount: {
    type: Number,
    required: true,
    min: 0
  },
  recurringPeriodMonths: {
    // e.g. 1 for monthly, 3 for quarterly, 12 for yearly, etc.
    type: Number,
    required: true,
    min: 1
  },
  firstPaymentDate: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual: calculate the next payment date after “now”
RecurringPaymentSchema.methods.computeNextPaymentDate = function() {
  // Starting from firstPaymentDate, keep adding recurringPeriodMonths until > today
  const today = new Date();
  let next = new Date(this.firstPaymentDate);
  const months = this.recurringPeriodMonths;

  // If firstPaymentDate is already in the future, that’s the next date:
  if (next > today) return next;

  // Otherwise, advance in increments of `months` until > today
  while (next <= today) {
    next.setMonth(next.getMonth() + months);
  }
  return next;
};

module.exports = mongoose.model('RecurringPayment', RecurringPaymentSchema);
