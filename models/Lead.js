const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    company: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    status: {type: String, enum: ['open', 'won', 'lost']},
    createdAt: { type: Date, default: Date.now },
    description: { type: String }
});

module.exports = mongoose.model('Lead', LeadSchema);