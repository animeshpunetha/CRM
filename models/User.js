const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hash before save
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
   // ← NEW: a unique employee identifier
  emp_id:    { type: String, required: true, unique: true },

  // ← NEW: if no manager, this equals emp_id; otherwise it’s the manager’s emp_id
  manager_id:{ type: String, required: true },
  resetPasswordToken:   String,
  resetPasswordExpires: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = model('User', UserSchema);