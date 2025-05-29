const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hash before save
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  resetPasswordToken:   String,
  resetPasswordExpires: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = model('User', UserSchema);