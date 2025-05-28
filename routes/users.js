// routes/users.js

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const User    = require('../models/User');
const { parseExcelBuffer } = require('../utils/excelImporter');

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// GET /users - list all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort('-createdAt');
    res.render('users/index', { users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET /users/new - form to create a user
router.get('/new', (req, res) => {
  res.render('users/new', {
    errors:    [],
    name:      '',
    email:     '',
    password:  '',
    password2: '',
    role:      'user'
  });
});

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
    const existing = await User.findOne({ email });
    if (existing) {
      errors.push({ msg: 'Email already registered' });
      return res.render('users/new', { errors, name, email, password, password2, role });
    }

    const hash = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hash, role });
    req.flash('success_msg', 'User registered');
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    res.redirect('/users');
  }
});

// GET /users/import - form to upload Excel
router.get('/import', (req, res) => {
  res.render('users/import');
});

// POST /users/import - handle Excel upload & import
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Please select an Excel file to upload');
    return res.redirect('/users/import');
  }

  try {
    const rawRows = await parseExcelBuffer(req.file.buffer);
    const usersToInsert = [];

    for (let row of rawRows) {
      const { name, email, password, role } = row;

      if (!name || !email || !password) {
        throw new Error(`Missing required field in row: ${JSON.stringify(row)}`);
      }
      if (await User.findOne({ email })) {
        throw new Error(`Email already registered: ${email}`);
      }

      const hash = await bcrypt.hash(String(password), 10);
      usersToInsert.push({
        name,
        email,
        password: hash,
        role: role && ['admin','user'].includes(role) ? role : 'user'
      });
    }

    await User.insertMany(usersToInsert);
    req.flash('success_msg', 'Users imported successfully');
    res.redirect('/users');
  } catch (err) {
    console.error('Users import error:', err);
    req.flash(
      'error_msg',
      err.message.startsWith('Missing') || err.message.startsWith('Email')
        ? err.message
        : 'Failed to import users from Excel'
    );
    res.redirect('/users/import');
  }
});

module.exports = router;
