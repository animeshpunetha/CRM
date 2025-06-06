const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const User = require('../models/User'); // ⬅️ Import User model
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Set up multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// GET /contacts → list all contacts
router.get('/', ensureAuthenticated, async (req, res) => {
  // get the sort fields and order from query parameters

  const sortField = req.query.sort || 'createdAt';
  const sortOrder = req.query.order === 'asc' ? 1 : -1;

  // construct dynamic sort 
  const sortOptions = {};
  sortOptions[sortField] = sortOrder;

  const contacts = await Contact.find().sort(sortOptions).collation({ locale: 'en', strength: 2 }).populate('owner', 'name'); // Optional: populate owner if referenced
  res.render('contacts/index', { contacts , currentSort: sortField, currentOrder: sortOrder === 1 ? 'asc' : 'desc' });
});

// GET /contacts/new → render form to add a new contact
router.get('/new', ensureAuthenticated, async (req, res) => {
  try {
    const users = await User.find().sort('name');
    res.render('contacts/new', {
      users,
      owner: '',
      name: '',
      company: '',
      email: '',
      phone: '',
      errors: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// POST /contacts → handle form submission
router.post('/', ensureAuthenticated, async (req, res) => {
  const { owner, name, company, email, phone, action } = req.body;
  let errors = [];

  if (!owner || !name || !email) {
    errors.push({ msg: 'Owner, name, and email are required' });
  }

  if (errors.length) {
    const users = await User.find().sort('name');
    return res.render('contacts/new', {
      errors,
      users,
      owner,
      name,
      company,
      email,
      phone
    });
  }

  try {
    await Contact.create({ owner, name, company, email, phone, action });
    req.flash('success_msg', 'Contact created successfully...');
    // if the “Save and New” button was clicked, go back to the blank form:
   if (action === 'save_and_new') {
     return res.redirect('/contacts/new');
   }
   // otherwise (“Save” or default), go to index:
    res.redirect('/contacts');
  } catch (err) {
    console.error(err);
    const users = await User.find().sort('name');
    res.render('contacts/new', {
      errors: [{ msg: 'Error creating contact, please try again' }],
      users,
      owner,
      name,
      company,
      email,
      phone
    });
  }
});
// GET /contacts/import → show Excel upload form
router.get('/import', ensureAuthenticated, async (req, res) => {
  res.render('contacts/import');
});

// POST /contacts/import → handle Excel upload and import
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Please select an Excel file to upload');
    return res.redirect('/contacts/import');
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
        owner: usersByName[r.owner],
        name: r.name,
        company: r.company,
        email: r.email,
        phone: r.phone,
      };
    });

    // 3) Bulk insert
    await Contact.insertMany(rows);

    req.flash('success_msg', 'Contacts imported successfully');
    res.redirect('/contacts');
  } catch (err) {
    console.error('Excel import error:', err);
    req.flash('error_msg',
      err.message.startsWith('Unknown owner')
        ? err.message
        : 'Failed to import contacts from Excel'
    );
    res.redirect('/contacts/import');
  }
});

// GET /contacts/:id/edit — show the edit form
router.get(
  '/:id/edit', ensureAuthenticated,
  async (req, res) => {
    try {
      const [contact, users] = await Promise.all([
        Contact.findById(req.params.id),
        User.find().sort('name')
      ]);
      if (!contact) throw new Error('Contact not found');
      res.render('contacts/edit', { contact, users, errors: [] });
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Cannot load edit form');
      res.redirect('/contacts');
    }
  }
);

// PUT /contacts/:id/edit — handle the edit submission
router.put(
  '/:id/edit', ensureAuthenticated,
  async (req, res) => {
    const { owner, name, company, email, phone } = req.body;
    let errors = [];
    if (!owner || !name || !email) {
      errors.push({ msg: 'Owner, Name, and Email are required.' });
    }
    if (errors.length) {
      const users = await User.find().sort('name');
      return res.render('contacts/edit', {
        contact: { _id: req.params.id, owner, name, company, email, phone },
        users,
        errors
      });
    }
    try {
      await Contact.findByIdAndUpdate(
        req.params.id,
        { owner, name, company, email, phone },
        { new: true }
      );
      req.flash('success_msg', 'Contact updated successfully');
      res.redirect('/contacts');
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Error updating contact');
      res.redirect('/contacts');
    }
  }
);

// DELETE /contacts/:id/delete — delete the contact
router.delete(
  '/:id/delete', ensureAuthenticated, ensureRole(['admin', 'super_admin'], { redirectBack: true }),
  async (req, res) => {
    try {
      await Contact.findByIdAndDelete(req.params.id);
      req.flash('success_msg', 'Contact deleted successfully');
      res.redirect('/contacts');
    } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Error deleting contact');
      res.redirect('/contacts');
    }
  }
);

// Export the data into xlsx format
// GET /contacts/export → send all contacts as an Excel file
router.get('/export', ensureAuthenticated, async (req, res) => {
  try {
    // 1) Fetch & populate your data
    const contacts = await Contact.find()
      .sort('-createdAt')
      .populate('owner', 'name');

    // 2) Build a new workbook and worksheet
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Contacts');

    // 3) Define your columns (header / key / width)
    ws.columns = [
      { header: 'Contact Owner',       key: 'owner',    width: 25 },
      { header: 'Contact Name',        key: 'name',     width: 30 },
      { header: 'Company',     key: 'company',  width: 25 },
      { header: 'Email',       key: 'email',    width: 30 },
      { header: 'Phone',       key: 'phone',    width: 20 },
      { header: 'Created At',  key: 'createdAt',width: 20 },
    ];

    // 4) Add rows
    contacts.forEach(contact => {
      ws.addRow({
        owner:       contact.owner?.name || '',
        name:        contact.name,
        company:     contact.company,
        email:       contact.email,
        phone:       contact.phone,
        createdAt:   contact.createdAt.toLocaleString(),
      });
    });

    // Build a timestamp: YYYYMMDD_HHMMSS -> to add in the name part
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const ts = [
      now.getFullYear(),
      pad(now.getMonth()+1),
      pad(now.getDate())
    ].join('') + '_' + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');

    const filename = `contacts_${ts}.xlsx`;

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
    req.flash('error_msg','Failed to export contacts');
    res.redirect('/contacts');
  }
});

module.exports = router;
