// routes/users.js

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const User    = require('../models/User');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// GET /users - list all users
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const users = await User.find().sort('-createdAt');
    res.render('users/index', { users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET /users/new - form to create a user
router.get('/new', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), (req, res) => {
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
router.post('/', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
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
router.get('/import', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), (req, res) => {
  res.render('users/import');
});

// POST /users/import - handle Excel upload & import
router.post('/import', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), upload.single('file'), async (req, res) => {
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

// GET /users/:id/edit - show edit form
router.get('/:id/edit', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }
    res.render('users/edit', { user });
  } catch (err) {
    console.error(err);
    res.redirect('/users');
  }
});

// PUT /users/:id - update user
router.put('/:id/edit', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  const { name, email, role, password, password2 } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    user.name = name;
    user.email = email;
    user.role = ['admin', 'user'].includes(role) ? role : 'user';

    if (password || password2) {
      if (password !== password2) {
        req.flash('error_msg', 'Passwords do not match');
        return res.redirect(`/users/${req.params.id}/edit`);
      }
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();
    req.flash('success_msg', 'User updated successfully');
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating user');
    res.redirect('/users');
  }
});

// DELETE /users/:id - delete user
router.delete('/:id/delete', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'User deleted successfully');
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting user');
    res.redirect('/users');
  }
});

module.exports = router;
