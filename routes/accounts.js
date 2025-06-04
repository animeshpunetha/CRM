const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const User = require('../models/User');
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// (A) Set up multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });


// (N) GET /accounts
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // get the sort fields and order from query parameters

    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    // construct dynamic sort 
    const sortOptions = {};
    sortOptions[sortField] = sortOrder;

    const accounts = await Account.find()
      .sort(sortOptions).collation({ locale: 'en', strength: 2 })
      .populate('owner', 'name');
    res.render('accounts/index', { accounts, currentSort: sortField, currentOrder: sortOrder === 1 ? 'asc' : 'desc' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// (I) GET /accounts/new
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

// (M) POST /accounts
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

// (E) GET /accounts/import → show Excel upload form
router.get('/import', ensureAuthenticated, async (req, res) => {
    res.render('accounts/import');
});

// (S) POST /accounts/import → handle Excel upload & import
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

    // (H) Bulk insert into Accounts collection
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
router.get('/:id/edit', ensureAuthenticated, ensureRole(['admin', 'super_admin'],{ redirectBack: true }), async (req, res) => {
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
router.put('/:id', ensureAuthenticated, ensureRole(['admin', 'super_admin'],{ redirectBack: true }), async (req, res) => {
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
router.delete('/:id/delete', ensureAuthenticated, ensureRole(['admin', 'super_admin'],{ redirectBack: true }), async (req, res) => {
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

// Export the data into xlsx format
// GET /accounts/export → send all deals as an Excel file
router.get('/export', ensureAuthenticated, async (req, res) => {
  try {
    // 1) Fetch & populate your data
    const accounts = await Account.find()
      .populate('owner', 'name');

    // 2) Build a new workbook and worksheet
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Accounts');

    // 3) Define your columns (header / key / width)
    ws.columns = [
      { header: 'Account Owner', key: 'owner', width: 25 },
      { header: 'Account Name', key: 'name', width: 30 },
      { header: 'Account Type', key: 'type', width: 25 },
      { header: 'Industry', key: 'industry', width: 30 },
      { header: 'Billing Street', key: 'billing_street', width: 30 },
      { header: 'Billing City', key: 'billing_city', width: 30 },
      { header: 'Billing State', key: 'billing_state', width: 30 },
      { header: 'Billing Country', key: 'billing_country', width: 30 },
      { header: 'Billing Code', key: 'billing_code', width: 10 },
    ];

    // 4) Add rows
    accounts.forEach(account => {
      ws.addRow({
        owner: account.owner?.name || '',
        name: account.name,
        type: account.type,
        industry: account.industry,
        billing_street: account.billing_street,
        billing_city: account.billing_city,
        billing_state: account.billing_state,
        billing_country: account.billing_country,
        billing_code: account.billing_code,
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

    const filename = `accounts_${ts}.xlsx`;

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
    req.flash('error_msg', 'Failed to export accounts');
    res.redirect('/accounts');
  }
});


module.exports = router;
