// routes/users.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const User = require('../models/User');
const Excel = require('exceljs');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

// GET /users - list all users
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // get the sort fields and order from query parameters

    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    // construct dynamic sort 
    const sortOptions = {};
    sortOptions[sortField] = sortOrder;

    const users = await User.find().sort(sortOptions).collation({ locale: 'en', strength: 2 });
    res.render('users/index', { users, currentSort: sortField, currentOrder: sortOrder === 1 ? 'asc' : 'desc' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET /users/new - form to create a user
router.get('/new',
  ensureAuthenticated,
  ensureRole('admin', { redirectBack: true }),
  async (req, res) => {
    try {
      // ◼️ Fetch all existing users so that new.ejs can loop over them
      const users = await User.find().sort('name'); // or whatever sort you like

      res.render('users/new', {
        users,            // ◀︎– must pass users here
        errors: [],
        name: '',
        email: '',
        password: '',
        password2: '',
        emp_id: '',    // ◀︎– new.ejs also expects emp_id
        manager_id: '',   // ◀︎– and manager_id
        role: 'user'
      });
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Unable to load form');
      return res.redirect('/users');
    }
  });

// POST /users - create a new user
router.post('/',
  ensureAuthenticated,
  ensureRole('admin',{ redirectBack: true }),
  async (req, res) => {
    const { name, email, password, password2, role, emp_id, manager_id } = req.body;
    let errors = [];

    if (!name || !email || !password || !password2 || !emp_id) {
      errors.push({ msg: 'Please fill in all fields' });
    }
    if (password !== password2) {
      errors.push({ msg: 'Passwords do not match' });
    }
    // (you might also check uniqueness of emp_id here, etc.)

    if (errors.length > 0) {
      try {
        // ◼️ Re‐fetch existing users before rendering errors
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
        req.flash('error_msg', 'Unable to re‐load form');
        return res.redirect('/users');
      }
    }

    try {
      // … creation logic (hash password, create in DB, etc.) …
      const hash = await bcrypt.hash(password, 10);
      await User.create({ name, email, password: hash, role, emp_id, manager_id: manager_id || emp_id });
      req.flash('success_msg', 'User registered');
      return res.redirect('/users');
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Server error—could not create user');
      return res.redirect('/users');
    }
});

// GET /users/import - form to upload Excel
router.get('/import', ensureAuthenticated, ensureRole('admin', { redirectBack: true }), (req, res) => {
  res.render('users/import');
});

// POST /users/import - handle Excel upload & import
router.post('/import', ensureAuthenticated, ensureRole('admin', { redirectBack: true }), upload.single('file'), async (req, res) => {
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
        role: role && ['admin', 'user'].includes(role) ? role : 'user'
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
router.get('/:id/edit', ensureAuthenticated, ensureRole('admin', { redirectBack: true }), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    const users = await User.find();
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }
    res.render('users/edit', { user, users });
  } catch (err) {
    console.error(err);
    res.redirect('/users');
  }
});

// PUT /users/:id - update user
router.put('/:id/edit', ensureAuthenticated, ensureRole('admin', { redirectBack: true }), async (req, res) => {
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
router.delete('/:id/delete', ensureAuthenticated, ensureRole('admin', { redirectBack: true }), async (req, res) => {
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

// Export the data into xlsx format
// GET /users/export → send all users as an Excel file
router.get('/export', ensureAuthenticated, async (req, res) => {
  try {
    // 1) Fetch & populate your data
    const users = await User.find()
      .sort('-createdAt')
    // 2) Build a new workbook and worksheet
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Users');

    // 3) Define your columns (header / key / width)
    ws.columns = [
      { header: 'User Name', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'User Role', key: 'role', width: 15 },
      { header: 'Created At', key: 'createdAt', width: 20 },
    ];

    // 4) Add rows
    users.forEach(user => {
      ws.addRow({
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toLocaleString(),
      });
    });

    // Build a timestamp: YYYYMMDD_HHMMSS -> to add in the name part
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate())
    ].join('') + '_' + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');

    const filename = `users_${ts}.xlsx`;

    // 5) Set response headers & stream the file
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      `Content-Disposition`,
      `attachment; filename = "${filename}"`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    req.flash('error_msg', 'Failed to export users');
    res.redirect('/users');
  }
});

module.exports = router;
