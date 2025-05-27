const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const User = require('../models/User');
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');

// Set up multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// GET /leads → list all leads
router.get('/', async (req, res) => {
    try {
        const leads = await Lead.find().sort('-createdAt');
        res.render('leads/index', { leads });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// GET /leads/new → render form to add a new lead
router.get('/new', async (req, res) => {
    try {
        const users = await User.find().sort('name');
        res.render('leads/new', {
            users,
            owner: '',
            name: '',
            company: '',
            email: '',
            phone: '',
            description: ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// POST /leads → handle form submission and create a new lead
router.post('/', async (req, res) => {
    const { owner, name, company, email, phone, description } = req.body;
    let errors = [];

    if (!owner || !name || !company || !email || !phone) {
        errors.push({ msg: 'Please fill in all required fields.' });
    }

    if (errors.length) {
        const users = await User.find().sort('name');
        return res.render('leads/new', {
            users,
            errors,
            owner,
            name,
            company,
            email,
            phone,
            description
        });
    }

    try {
        await Lead.create({ owner, name, company, email, phone, description });
        req.flash('success_msg', 'Lead created successfully');
        res.redirect('/leads');
    } catch (err) {
        console.error(err);
        const users = await User.find().sort('name');
        res.render('leads/new', {
            errors: [{ msg: 'Error creating lead, please try again' }],
            users,
            owner,
            name,
            company,
            email,
            phone,
            description
        });
    }
});

// GET /leads/import → show Excel upload form
router.get('/import', async (req, res) => {
    res.render('leads/import');
});

// POST /leads/import → handle Excel upload and import
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Please select an Excel file to upload');
    return res.redirect('/leads/import');
  }

  try {
    // 1) Parse raw rows
    let rows = await parseExcelBuffer(req.file.buffer);

    // 2) For each row, find the User by name and replace with their _id
    const usersByName = {};
    const allUsers = await User.find().select('name');
    allUsers.forEach(u => { usersByName[u.name] = u._id; });

    rows = rows.map(r => {
      if (!usersByName[r.owner]) {
        throw new Error(`Unknown owner name "${r.owner}"`);
      }
      return {
        owner:      usersByName[r.owner],
        name:       r.name,
        company:    r.company,
        email:      r.email,
        phone:      r.phone,
        description:r.description || ''
      };
    });

    // 3) Bulk insert
    await Lead.insertMany(rows);

    req.flash('success_msg', 'Leads imported successfully');
    res.redirect('/leads');
  } catch (err) {
    console.error('Excel import error:', err);
    req.flash('error_msg',
      err.message.startsWith('Unknown owner')
        ? err.message
        : 'Failed to import leads from Excel'
    );
    res.redirect('/leads/import');
  }
});

module.exports = router;
