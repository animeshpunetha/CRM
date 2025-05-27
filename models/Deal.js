const mongoose = require('mongoose');

const DealSchema = new mongoose.Schema({
    owner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', // assumes you have a User model
            required: true},
    name: { type: String, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    contact_person: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    amount: { type: Number, required: true, min: 0 },
    due_date: { type: Date, default: Date.now },
    probablity: { type: Number, enum: [0, 10, 20, 40, 60, 75, 90, 100], required: true }
});

module.exports = mongoose.model('Deal', DealSchema);