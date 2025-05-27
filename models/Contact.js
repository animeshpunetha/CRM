const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
    owner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    name: {type : String, required: true},
    company : {type : String, required : true},
    email: {type: String, required: true},
    phone: {type: String, required: true},
    createdAt: {type: Date, default: Date.now}
});

module.exports = mongoose.model('Contact', ContactSchema);