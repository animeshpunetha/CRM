const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// GET /users - list all users
router.get('/', async (req, res) => {
  const users = await User.find().sort('-createdAt');
  res.render('users/index', { users });
});

// GET /users/new - form to create a user
router.get('/new', (req, res) => res.render('users/new', {
  errors: [],
  name: '',
  email: '',
  password: '',
  password2: '',
  role: 'user'
}));

// POST /users - create a new user
router.post('/', async (req, res) => {
  const { name, email, password, password2, role } = req.body;
  let errors = [];
  if (!name || !email || !password || !password2) {
    errors.push({ msg: 'Please fill in all fields' });
  }
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }
  if (errors.length > 0) {
    return res.render('users/new', { errors, name, email, password, password2, role });
  }
  try {
    let user = await User.findOne({ email });
    if (user) {
      errors.push({ msg: 'Email already registered' });
      return res.render('users/new', { errors, name, email, password, password2, role });
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    user = new User({ name, email, password: hash, role });
    await user.save();
    req.flash('success_msg', 'User registered');
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    res.redirect('/users');
  }
});

module.exports = router;