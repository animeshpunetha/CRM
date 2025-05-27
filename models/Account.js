// can be created by the admin only
const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    owner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    name: { type: String, required: true },
    type: { type: String, required: true },
    industry: { type: String, required: true },
    // address info
    billing_street: { type: String, required: true },
    billing_city: { type: String, required: true },
    billing_state: { type: String, required: true },
    billing_code: { type: String, required: true },
    billing_country: { type: String, required: true },
});

module.exports = mongoose.model('Account', AccountSchema);