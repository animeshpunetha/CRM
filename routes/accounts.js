const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const User = require('../models/User');
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Set up multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });


// GET /accounts
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const accounts = await Account.find()
      .sort('-createdAt')
      .populate('owner', 'name');
    res.render('accounts/index', { accounts });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET /accounts/new
router.get('/new', ensureAuthenticated, async (req, res) => {
  try {
    const users = await User.find().sort('name');
    res.render('accounts/new', {
      users,
      owner: '',
      name: '',
      type: '',
      industry: '',
      billing_street: '',
      billing_city: '',
      billing_state: '',
      billing_code: '',
      billing_country: '',
      errors: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// POST /accounts
router.post('/', ensureAuthenticated, async (req, res) => {
  const {
    owner,
    name,
    type,
    industry,
    billing_street,
    billing_city,
    billing_state,
    billing_code,
    billing_country,
    action // added: action will be 'save' or 'save_and_new'
  } = req.body;

  let errors = [];

  if (!owner || !name || !type || !industry ||
    !billing_street || !billing_city ||
    !billing_state || !billing_code || !billing_country) {
    errors.push({ msg: 'Please fill in all required fields.' });
  }

  if (errors.length) {
    const users = await User.find().sort('name');
    return res.render('accounts/new', {
      errors,
      users,
      owner,
      name,
      type,
      industry,
      billing_street,
      billing_city,
      billing_state,
      billing_code,
      billing_country
    });
  }

  try {
    const account = await Account.create({
      owner,
      name,
      type,
      industry,
      billing_street,
      billing_city,
      billing_state,
      billing_code,
      billing_country
    });

    if (action === 'save_and_new') {
      req.flash('success_msg', 'Account created. You can create another now.');
      return res.redirect('/accounts/new');
    } else {
      req.flash('success_msg', 'Account created successfully');
      return res.redirect('/accounts');
    }
  } catch (err) {
    console.error('Mongoose error:', err);
    const users = await User.find().sort('name');
    res.render('accounts/new', {
      errors: [{ msg: 'Error creating account, please try again.' }],
      users,
      owner,
      name,
      type,
      industry,
      billing_street,
      billing_city,
      billing_state,
      billing_code,
      billing_country
    });
  }
});

// GET /accounts/import → show Excel upload form
router.get('/import', ensureAuthenticated, async (req, res) => {
    res.render('accounts/import');
});

// POST /accounts/import → handle Excel upload & import
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Please select an Excel file to upload');
    return res.redirect('/accounts/import');
  }

  try {
    // 1) Parse raw rows
    let rows = await parseExcelBuffer(req.file.buffer);

    // 2) Build owner-name → ObjectId map
    const usersByName = {};
    (await User.find().select('name')).forEach(u => {
      usersByName[u.name] = u._id;
    });

    // 3) Normalize & validate each row
    const accountsToInsert = rows.map(r => {
      if (!usersByName[r.owner]) {
        throw new Error(`Unknown owner name "${r.owner}"`);
      }
      // Ensure all required fields exist
      const {
        name,
        type,
        industry,
        billing_street,
        billing_city,
        billing_state,
        billing_code,
        billing_country
      } = r;

      if (!name || !type || !industry ||
          !billing_street || !billing_city ||
          !billing_state || !billing_code || !billing_country) {
        throw new Error(`Missing required field in row: ${JSON.stringify(r)}`);
      }

      return {
        owner:          usersByName[r.owner],
        name,
        type,
        industry,
        billing_street,
        billing_city,
        billing_state,
        billing_code,
        billing_country
      };
    });

    // 4) Bulk insert into Accounts collection
    await Account.insertMany(accountsToInsert);

    req.flash('success_msg', 'Accounts imported successfully');
    res.redirect('/accounts');
  } catch (err) {
    console.error('Accounts import error:', err);
    req.flash(
      'error_msg',
      err.message.startsWith('Unknown owner') || err.message.startsWith('Missing')
        ? err.message
        : 'Failed to import accounts from Excel'
    );
    res.redirect('/accounts/import');
  }
});

// GET /accounts/:id/edit  → show the edit form
router.get('/:id/edit', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  try {
    const [account, users] = await Promise.all([
      Account.findById(req.params.id),
      User.find().sort('name')
    ]);
    if (!account) {
      req.flash('error_msg', 'Account not found');
      return res.redirect('/accounts');
    }
    res.render('accounts/edit', {
      account,
      users,
      errors: []
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error');
    res.redirect('/accounts');
  }
});

// PUT /accounts/:id  → handle the edit form submit
router.put('/:id', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  const {
    owner, name, type, industry,
    billing_street, billing_city,
    billing_state, billing_code,
    billing_country
  } = req.body;

  let errors = [];
  // validate required fields
  if (!owner||!name||!type||!industry||
      !billing_street||!billing_city||
      !billing_state||!billing_code||!billing_country) {
    errors.push({ msg: 'Please fill in all required fields.' });
  }

  if (errors.length) {
    const users = await User.find().sort('name');
    // re-render edit with errors
    return res.render('accounts/edit', {
      account: { _id: req.params.id, owner, name, type, industry,
                 billing_street, billing_city,
                 billing_state, billing_code,
                 billing_country },
      users,
      errors
    });
  }

  try {
    await Account.findByIdAndUpdate(req.params.id, {
      owner, name, type, industry,
      billing_street, billing_city,
      billing_state, billing_code,
      billing_country
    }, { new: true });

    req.flash('success_msg', 'Account updated successfully');
    res.redirect('/accounts');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating account');
    res.redirect('/accounts');
  }
});

// DELETE /accounts/:id
router.delete('/:id/delete', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  try {
    await Account.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Account deleted successfully');
    res.redirect('/accounts');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting account');
    res.redirect('/accounts');
  }
});


module.exports = router;
