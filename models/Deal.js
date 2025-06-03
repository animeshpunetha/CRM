const mongoose = require('mongoose');

const stageMapping = {
    0: 'Closed Lost',
    10: 'Qualification',
    20: 'Needs Analysis',
    40: 'Value Proposition',
    60: 'Identify Decision Makers',
    75: 'Proposal/Price Quote',
    90: 'Negotiation/Review',
    100: 'Closed Won'
};

const DealSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId, ref: 'User', // assumes you have a User model
        required: true
    },
    name: { type: String, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    contact_person: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    amount: { type: Number, required: true, min: 0 },
    due_date: { type: Date, default: Date.now },
    probablity: { type: Number, enum: Object.keys(stageMapping).map(Number), required: true }

});

DealSchema.virtual('stage_name').get(function () {
  return stageMapping[this.probablity];
});

DealSchema.set('toJSON', { virtuals: true });
DealSchema.set('toObject', { virtuals: true });

const Deal = mongoose.model('Deal', DealSchema);
Deal.stageMapping = stageMapping;
module.exports = Deal;