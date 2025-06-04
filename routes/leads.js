// routes/leads.js

const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const User = require('../models/User');
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// In-memory multer storage
const upload = multer({ storage: multer.memoryStorage() });

// GET /leads → list all leads with sorting
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const sortOptions = {};
    sortOptions[sortField] = sortOrder;

    const leads = await Lead.find()
      .sort(sortOptions)
      .collation({ locale: 'en', strength: 2 })
      .populate('owner', 'name');

    res.render('leads/index', {
      leads,
      currentSort: sortField,
      currentOrder: sortOrder === 1 ? 'asc' : 'desc'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET /leads/new → render form to add a new lead
router.get('/new', ensureAuthenticated, async (req, res) => {
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
router.post('/', ensureAuthenticated, async (req, res) => {
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
    return res.render('leads/new', {
      users,
      errors: [{ msg: 'Error creating lead, please try again' }],
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
router.get('/import', ensureAuthenticated, async (req, res) => {
  res.render('leads/import');
});

// POST /leads/import → handle Excel upload and import
router.post('/import', ensureAuthenticated, upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Please select an Excel file to upload');
    return res.redirect('/leads/import');
  }

  try {
    let rows = await parseExcelBuffer(req.file.buffer);

    // Map owner names → ObjectId
    const allUsers = await User.find().select('name');
    const usersByName = {};
    allUsers.forEach(u => {
      usersByName[u.name] = u._id;
    });

    rows = rows.map(r => {
      if (!usersByName[r.owner]) {
        throw new Error(`Unknown owner name "${r.owner}"`);
      }
      return {
        owner: usersByName[r.owner],
        name: r.name,
        company: r.company,
        email: r.email,
        phone: r.phone,
        description: r.description || ''
      };
    });

    // Bulk insert
    await Lead.insertMany(rows);

    req.flash('success_msg', 'Leads imported successfully');
    res.redirect('/leads');
  } catch (err) {
    console.error('Excel import error:', err);
    req.flash(
      'error_msg',
      err.message.startsWith('Unknown owner')
        ? err.message
        : 'Failed to import leads from Excel'
    );
    res.redirect('/leads/import');
  }
});

// GET /leads/:id/edit → render edit form
router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).populate('owner', 'name');
    if (!lead) return res.status(404).send('Lead not found');

    // Ensure lead.owner is never `null` when passed to the template
    if (!lead.owner) {
      // If no owner assigned, set a dummy object so `.owner._id` always exists
      lead.owner = { _id: '' };
    }

    const users = await User.find().sort('name');
    res.render('leads/edit', {
      users,
      errors: [],
      lead
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// PUT /leads/:id/edit → update lead
router.put('/:id/edit', ensureAuthenticated, async (req, res) => {
  const { owner, name, company, email, phone, description } = req.body;
  let errors = [];

  if (!owner || !name || !company || !email || !phone) {
    errors.push({ msg: 'Please fill in all required fields.' });
  }

  try {
    const users = await User.find().sort('name');
    const lead = await Lead.findById(req.params.id).populate('owner', 'name');
    if (!lead) return res.status(404).send('Lead not found');

    if (errors.length) {
      // Build a “lead‐shaped” object so that template’s `lead.owner._id.toString()` never sees null
      const tempLead = {
        _id: req.params.id,
        owner: { _id: owner || '' },
        name,
        company,
        email,
        phone,
        description
      };
      return res.render('leads/edit', {
        users,
        errors,
        lead: tempLead
      });
    }

    // Persist changes
    lead.owner = owner;
    lead.name = name;
    lead.company = company;
    lead.email = email;
    lead.phone = phone;
    lead.description = description;
    await lead.save();

    req.flash('success_msg', 'Lead updated successfully');
    res.redirect('/leads');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// DELETE /leads/:id/delete → delete lead
router.delete(
  '/:id/delete',
  ensureAuthenticated,
  ensureRole(['admin', 'super_admin'], { redirectBack: true }),
  async (req, res) => {
    try {
      await Lead.findByIdAndDelete(req.params.id);
      req.flash('success_msg', 'Lead deleted successfully');
      res.redirect('/leads');
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to delete lead');
      res.redirect('/leads');
    }
  }
);

// GET /leads/export → send all leads as an Excel file
router.get('/export', ensureAuthenticated, async (req, res) => {
  try {
    const leads = await Lead.find()
      .sort('-createdAt')
      .populate('owner', 'name');

    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Leads');

    ws.columns = [
      { header: 'Owner',       key: 'owner',       width: 25 },
      { header: 'Name',        key: 'name',        width: 30 },
      { header: 'Company',     key: 'company',     width: 25 },
      { header: 'Email',       key: 'email',       width: 30 },
      { header: 'Phone',       key: 'phone',       width: 20 },
      { header: 'Created At',  key: 'createdAt',   width: 20 },
      { header: 'Description', key: 'description', width: 40 }
    ];

    leads.forEach(lead => {
      ws.addRow({
        owner:       lead.owner?.name || '',
        name:        lead.name,
        company:     lead.company,
        email:       lead.email,
        phone:       lead.phone,
        createdAt:   lead.createdAt.toLocaleString(),
        description: lead.description || ''
      });
    });

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts =
      [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate())
      ].join('') +
      '_' +
      [
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds())
      ].join('');

    const filename = `leads_${ts}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    req.flash('error_msg', 'Failed to export leads');
    res.redirect('/leads');
  }
});

module.exports = router;