// routes/users.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const User = require('../models/User');
const Excel = require('exceljs');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated } = require('../middleware/auth');

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ─── Helper: allow only admin OR super_admin ─────────────────────────────────
function ensureAdminOrSuper(req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    return next();
  }
  req.flash('error_msg', 'Not authorized');
  return res.redirect('/users');
}

// ─── GET /users - list all users (only admin/super_admin) ─────────────────────
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // get sort fields/order from query
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const sortOptions = { [sortField]: sortOrder };

    // super_admin and admin both see everyone
    const users = await User.find()
      .sort(sortOptions)
      .collation({ locale: 'en', strength: 2 });
    res.render('users/index', {
      users,
      currentSort: sortField,
      currentOrder: sortOrder === 1 ? 'asc' : 'desc'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ─── GET /users/new - form to create a user (only admin/super_admin) ──────────
router.get('/new', ensureAuthenticated, ensureAdminOrSuper, async (req, res) => {
  try {
    // fetch existing users so new.ejs can list them in the “manager” dropdown
    const users = await User.find().sort('name');
    res.render('users/new', {
      users,
      errors: [],
      name: '',
      email: '',
      password: '',
      password2: '',
      emp_id: '',
      manager_id: '',
      role: 'user' // default to “user” on first load
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to load form');
    return res.redirect('/users');
  }
});

// ─── POST /users - create a new user (only admin/super_admin) ─────────────────
router.post('/', ensureAuthenticated, ensureAdminOrSuper, async (req, res) => {
  const { name, email, password, password2, role, emp_id, manager_id } = req.body;
  let errors = [];

  // Basic validation
  if (!name || !email || !password || !password2 || !emp_id) {
    errors.push({ msg: 'Please fill in all required fields' });
  }
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }

  // If errors, re-render the form with previous values + error messages
  if (errors.length > 0) {
    try {
      const users = await User.find().sort('name');
      return res.render('users/new', {
        users,
        errors,
        name,
        email,
        password,
        password2,
        emp_id,
        manager_id,
        role
      });
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Unable to re-load form');
      return res.redirect('/users');
    }
  }

  // No validation errors → proceed to creation
  try {
    // 1) Check uniqueness of email & emp_id
    const existingEmail = await User.findOne({ email: email.trim() });
    if (existingEmail) {
      req.flash('error_msg', 'Email is already registered');
      return res.redirect('/users/new');
    }
    const existingEmp = await User.findOne({ emp_id: emp_id.trim() });
    if (existingEmp) {
      req.flash('error_msg', 'Employee ID is already in use');
      return res.redirect('/users/new');
    }

    // 2) Hash password
    const hash = await bcrypt.hash(password, 10);

    // 3) Build user object. If manager_id is blank, default it to emp_id
    const finalManagerId = manager_id && manager_id.trim() !== '' ? manager_id.trim() : emp_id.trim();

    // 4) Permit role = 'user' | 'admin' | 'super_admin'
    const finalRole =
      ['user', 'admin', 'super_admin'].includes(role) ? role : 'user';

    await User.create({
      name: name.trim(),
      email: email.trim(),
      password: hash,
      role: finalRole,
      emp_id: emp_id.trim(),
      manager_id: finalManagerId
    });

    req.flash('success_msg', 'User registered successfully');
    return res.redirect('/users');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error—could not create user');
    return res.redirect('/users');
  }
});

// ─── GET /users/import - form to upload Excel (only admin/super_admin) ─────────
router.get('/import', ensureAuthenticated, ensureAdminOrSuper, (req, res) => {
  res.render('users/import');
});

// ─── POST /users/import - handle Excel upload & import (only admin/super_admin) ─
router.post(
  '/import',
  ensureAuthenticated,
  ensureAdminOrSuper,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      req.flash('error_msg', 'Please select an Excel file to upload');
      return res.redirect('/users/import');
    }

    try {
      const rawRows = await parseExcelBuffer(req.file.buffer);
      const usersToInsert = [];

      // Loop over each row; build a valid User object
      for (let row of rawRows) {
        const { name, email, password, role, emp_id, manager_id } = row;

        // Required fields check
        if (!name || !email || !password || !emp_id) {
          throw new Error(`Missing required field in row: ${JSON.stringify(row)}`);
        }

        // Uniqueness checks (email & emp_id)
        const existingEmail = await User.findOne({ email: email.trim() });
        if (existingEmail) {
          throw new Error(`Email already registered: ${email}`);
        }
        const existingEmp = await User.findOne({ emp_id: emp_id.trim() });
        if (existingEmp) {
          throw new Error(`Employee ID already in use: ${emp_id}`);
        }

        // Hash password
        const hash = await bcrypt.hash(String(password), 10);

        // Determine final manager_id
        const finalManagerId =
          manager_id && manager_id.trim() !== '' ? manager_id.trim() : emp_id.trim();

        // Allow role = 'user' | 'admin' | 'super_admin'
        const finalRole =
          ['user', 'admin', 'super_admin'].includes(role) ? role : 'user';

        usersToInsert.push({
          name: name.trim(),
          email: email.trim(),
          password: hash,
          role: finalRole,
          emp_id: emp_id.trim(),
          manager_id: finalManagerId
        });
      }

      // Bulk‐insert all rows
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
  }
);

// ─── GET /users/:id/edit - show edit form (only admin/super_admin) ────────────
router.get('/:id/edit', ensureAuthenticated, ensureAdminOrSuper, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const users = await User.find().sort('name'); 
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }
    res.render('users/edit', { user, users, errors: [] });
  } catch (err) {
    console.error(err);
    res.redirect('/users');
  }
});

// ─── PUT /users/:id/edit - update user (only admin/super_admin) ──────────────
router.put('/:id/edit', ensureAuthenticated, ensureAdminOrSuper, async (req, res) => {
  const { name, email, role, password, password2, emp_id, manager_id } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    // Update name & email & role & emp_id
    user.name = name.trim();
    user.email = email.trim();
    user.emp_id = emp_id.trim();

    // Allow setting role = 'user' | 'admin' | 'super_admin'
    user.role = ['user', 'admin', 'super_admin'].includes(role) ? role : 'user';

    // Update manager_id (or self if blank)
    user.manager_id = manager_id && manager_id.trim() !== '' ? manager_id.trim() : emp_id.trim();

    // If either password field is non-empty, validate & re-hash
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

// ─── DELETE /users/:id/delete - delete user (only admin/super_admin) ───────────
router.delete('/:id/delete', ensureAuthenticated, ensureAdminOrSuper, async (req, res) => {
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

// ─── GET /users/export - export all users as Excel (only admin/super_admin) ────
router.get('/export', ensureAuthenticated, ensureAdminOrSuper, async (req, res) => {
  try {
    // 1) Fetch all users
    const users = await User.find().sort('-createdAt');

    // 2) Build workbook & worksheet
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Users');

    // 3) Define columns
    ws.columns = [
      { header: 'User Name', key: 'name', width: 30 },
      { header: 'Email',    key: 'email', width: 30 },
      { header: 'User Role', key: 'role', width: 15 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ];

    // 4) Add rows
    users.forEach((u) => {
      ws.addRow({
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt.toLocaleString()
      });
    });

    // 5) Prepare filename with timestamp
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts =
      [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate())
      ].join('') +
      '_' +
      [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');
    const filename = `users_${ts}.xlsx`;

    // 6) Stream back to client
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    req.flash('error_msg', 'Failed to export users');
    res.redirect('/users');
  }
});

module.exports = router;
