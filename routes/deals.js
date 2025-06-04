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

async function buildOwnerFilter(req) {
  // If super_admin, no filter:
  if (req.user.role === 'super_admin') {
    return {};
  }

  // Otherwise, user can see:
  //   • their own deals  (owner = req.user._id)
  //   • plus any deals owned by direct reports
  const currentEmpId = req.user.emp_id;
  const currentUserId = req.user._id;

  // Find all users whose manager_id equals currentEmpId
  const directReports = await User.find(
    { manager_id: currentEmpId },
    '_id'
  ).lean();

  // Collect their _id’s:
  const ownersToInclude = [ currentUserId ];
  directReports.forEach(u => ownersToInclude.push(u._id));

  return { owner: { $in: ownersToInclude } };
}


// ─── GET /deals → list all deals, filtered by role/hierarchy ───────────────
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // 1) build sort options (unchanged)
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const sortOptions = { [sortField]: sortOrder };

    // 2) build owner‐filter based on role/manager‐hierarchy
    const ownerFilter = await buildOwnerFilter(req); 
    //    → {} if super_admin, or { owner: { $in: [...] } } otherwise

    // 3) fetch deals with that filter
    const deals = await Deal.find(ownerFilter)
      .sort(sortOptions)
      .collation({ locale: 'en', strength: 2 })
      .populate('owner', 'name')
      .populate('account', 'name')
      .populate('contact_person', 'name');

    return res.render('deals/index', {
      deals,
      currentSort: sortField,
      currentOrder: sortOrder === 1 ? 'asc' : 'desc'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server Error');
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

// ─── GET /deals/kanban → same owner‐filter logic + group by probability ─────
router.get('/kanban', ensureAuthenticated, async (req, res) => {
  try {
    // 1) Determine which deals to show
    const ownerFilter = await buildOwnerFilter(req);

    // 2) Fetch only those deals
    const deals = await Deal.find(ownerFilter)
      .populate('owner', 'name')
      .populate('account', 'name')
      .populate('contact_person', 'name')
      .sort('name'); 

    // 3) Now group them by probability as before
    const buckets = [0, 10, 20, 40, 60, 75, 90, 100];
    const totalDealsCount = deals.length;

    // initialize grouped data
    const grouped = buckets.reduce((acc, p) => {
      acc[p] = { deals: [], count: 0, totalAmount: 0, percentage: 0 };
      return acc;
    }, {});

    // fill grouped
    deals.forEach(deal => {
      if (grouped[deal.probablity]) {
        grouped[deal.probablity].deals.push(deal);
        grouped[deal.probablity].count++;
        grouped[deal.probablity].totalAmount += deal.amount;
      }
    });

    // calculate percentages & formatted totals
    buckets.forEach(p => {
      if (totalDealsCount > 0) {
        grouped[p].percentage = ((grouped[p].count / totalDealsCount) * 100).toFixed(0);
      }
      const amt = grouped[p].totalAmount || 0;
      grouped[p].formattedTotal = amt.toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    });

    // 4) Render the kanban view
    return res.render('deals/kanban', {
      buckets,
      grouped,
      stageMapping: Deal.stageMapping
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server Error');
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

    const usersByName = Object.fromEntries(allUsers.map(u => [u.name, u._id]));
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
        owner: usersByName[r.owner],
        name: r.name,
        account: accountsByName[r.account],
        contact_person: contactsByName[r.contact_person],
        amount: Number(r.amount) || 0,
        due_date: r.due_date ? new Date(r.due_date) : undefined,
        probablity: Number(r.probablity) || 0
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
router.get('/:id/edit', ensureAuthenticated, ensureRole(['admin', 'super_admin'], { redirectBack: true }), async (req, res) => {
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
router.put('/:id', ensureAuthenticated, ensureRole(['admin', 'super_admin'], { redirectBack: true }), async (req, res) => {
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
router.delete('/:id', ensureAuthenticated, ensureRole(['admin', 'super_admin'], { redirectBack: true }), async (req, res) => {
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

// Export the data into xlsx format
// GET /deals/export → send all deals as an Excel file
router.get('/export', ensureAuthenticated, async (req, res) => {
  try {
    // 1) Fetch & populate your data
    const deals = await Deal.find()
      .sort('-createdAt')
      .populate('owner', 'name')
      .populate('account', 'name')
      .populate('contact_person', 'name');

    // 2) Build a new workbook and worksheet
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Deals');

    // 3) Define your columns (header / key / width)
    ws.columns = [
      { header: 'Deal Owner', key: 'owner', width: 25 },
      { header: 'Deal Name', key: 'name', width: 30 },
      { header: 'Account', key: 'account', width: 25 },
      { header: 'Contact', key: 'contact_person', width: 30 },
      { header: 'Amount (₹)', key: 'amount', width: 20 },
      { header: 'Due Date', key: 'due_date', width: 20 },
      { header: 'Probablity (%)', key: 'probablity', width: 20 },
    ];

    // 4) Add rows
    deals.forEach(deal => {
      ws.addRow({
        owner: deal.owner?.name || '',
        name: deal.name,
        account: deal.account?.name || '',
        contact_person: deal.contact_person?.name || '',
        amount: deal.amount,
        due_date: deal.due_date.toLocaleString(),
        probablity: deal.probablity,
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

    const filename = `deals_${ts}.xlsx`;

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
    req.flash('error_msg', 'Failed to export deals');
    res.redirect('/deals');
  }
});

module.exports = router;