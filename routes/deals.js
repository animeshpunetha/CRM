const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const User = require('../models/User');
const Account = require('../models/Account');
const Contact = require('../models/Contact');
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Set up multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// GET /deals
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const deals = await Deal.find()
            .sort('-createdAt')
            .populate('owner', 'name')
            .populate('account', 'name')
            .populate('contact_person', 'name');
        res.render('deals/index', { deals });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// GET /deals/new
router.get('/new', ensureAuthenticated, async (req, res) => {
    try {
        const [users, accounts, contacts] = await Promise.all([
            User.find().sort('name'),
            Account.find().sort('name'),
            Contact.find().sort('name')
        ]);
        res.render('deals/new', {
            users,
            accounts,
            contacts,
            owner: '',
            name: '',
            account: '',
            contact_person: '',
            amount: '',
            due_date: '',
            probablity: '',
            errors: []
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /deals
router.post('/', ensureAuthenticated, async (req, res) => {
    const {
        owner,
        name,
        account,
        contact_person,
        amount,
        due_date,
        probablity,
        action // this will hold 'save' or 'save_and_new'
    } = req.body;

    let errors = [];

    if (
        !owner ||
        !name ||
        !account ||
        !contact_person ||
        amount == null ||
        amount === '' ||
        probablity == null ||
        probablity === ''
    ) {
        errors.push({ msg: 'Please fill in all required fields.' });
    }

    if (errors.length) {
        const [users, accounts, contacts] = await Promise.all([
            User.find().sort('name'),
            Account.find().sort('name'),
            Contact.find().sort('name')
        ]);
        return res.render('deals/new', {
            errors,
            users,
            accounts,
            contacts,
            owner,
            name,
            account,
            contact_person,
            amount,
            due_date,
            probablity
        });
    }

    try {
        await Deal.create({
            owner,
            name,
            account,
            contact_person,
            amount,
            due_date: due_date || Date.now(),
            probablity
        });

        if (action === 'save_and_new') {
            req.flash('success_msg', 'Deal created. You can create a new one now.');
            return res.redirect('/deals/new');
        } else {
            req.flash('success_msg', 'Deal created successfully.');
            return res.redirect('/deals');
        }
    } catch (err) {
        console.error(err);
        const [users, accounts, contacts] = await Promise.all([
            User.find().sort('name'),
            Account.find().sort('name'),
            Contact.find().sort('name')
        ]);
        return res.render('deals/new', {
            errors: [{ msg: 'Error creating deal; please try again.' }],
            users,
            accounts,
            contacts,
            owner,
            name,
            account,
            contact_person,
            amount,
            due_date,
            probablity
        });
    }
});

// GET /deals/import → show Excel upload form
router.get('/import', ensureAuthenticated, async (req, res) => {
    res.render('deals/import');
});

// POST /deals/import → handle Excel upload and import
router.post('/import', ensureAuthenticated, upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Please select an Excel file to upload');
    return res.redirect('/deals/import');
  }

  try {
    // 1) Parse raw rows
    let rows = await parseExcelBuffer(req.file.buffer);

    // 2) Build lookup maps by name → _id
    const [allUsers, allAccounts, allContacts] = await Promise.all([
      User.find().select('name'),
      Account.find().select('name'),
      Contact.find().select('name')
    ]);

    const usersByName    = Object.fromEntries(allUsers   .map(u => [u.name, u._id]));
    const accountsByName = Object.fromEntries(allAccounts.map(a => [a.name, a._id]));
    const contactsByName = Object.fromEntries(allContacts.map(c => [c.name, c._id]));

    // 3) Normalize and validate each row
    rows = rows.map(r => {
      // Owner
      if (!usersByName[r.owner]) {
        throw new Error(`Unknown owner name "${r.owner}"`);
      }
      // Account
      if (!accountsByName[r.account]) {
        throw new Error(`Unknown account name "${r.account}"`);
      }
      // Contact Person
      if (!contactsByName[r.contact_person]) {
        throw new Error(`Unknown contact person name "${r.contact_person}"`);
      }

      return {
        owner:          usersByName[r.owner],
        name:           r.name,
        account:        accountsByName[r.account],
        contact_person: contactsByName[r.contact_person],
        amount:         Number(r.amount) || 0,
        due_date:       r.due_date ? new Date(r.due_date) : undefined,
        probablity:     Number(r.probablity) || 0
      };
    });

    // 4) Bulk insert
    await Deal.insertMany(rows);

    req.flash('success_msg', 'Deals imported successfully');
    res.redirect('/deals');
  } catch (err) {
    console.error('Excel import error:', err);
    req.flash(
      'error_msg',
      err.message.startsWith('Unknown')
        ? err.message
        : 'Failed to import deals from Excel'
    );
    res.redirect('/deals/import');
  }
});

// GET /deals/:id/edit → show the edit form
router.get('/:id/edit', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    const [users, accounts, contacts] = await Promise.all([
      User.find().sort('name'),
      Account.find().sort('name'),
      Contact.find().sort('name')
    ]);

    if (!deal) {
      req.flash('error_msg', 'Deal not found');
      return res.redirect('/deals');
    }

    res.render('deals/edit', {
      deal,
      users,
      accounts,
      contacts,
      errors: []
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error loading deal for editing');
    res.redirect('/deals');
  }
});


// PUT /deals/:id → update deal
router.put('/:id', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  const { owner, name, account, contact_person, amount, due_date, probablity } = req.body;

  let errors = [];

  if (!owner || !name || !account || !contact_person || amount == null || probablity == null) {
    errors.push({ msg: 'Please fill in all required fields.' });
  }

  try {
    const [users, accounts, contacts] = await Promise.all([
      User.find().sort('name'),
      Account.find().sort('name'),
      Contact.find().sort('name')
    ]);

    if (errors.length) {
      const deal = await Deal.findById(req.params.id);
      return res.render('deals/edit', {
        deal,
        users,
        accounts,
        contacts,
        errors
      });
    }

    await Deal.findByIdAndUpdate(req.params.id, {
      owner,
      name,
      account,
      contact_person,
      amount,
      due_date,
      probablity
    });

    req.flash('success_msg', 'Deal updated successfully');
    res.redirect('/deals');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating deal');
    res.redirect('/deals');
  }
});


// DELETE /deals/:id → delete deal
router.delete('/:id', ensureAuthenticated, ensureRole('admin',{ redirectBack: true }), async (req, res) => {
  try {
    await Deal.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Deal deleted successfully');
    res.redirect('/deals');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting deal');
    res.redirect('/deals');
  }
});


module.exports = router;
