// routes/recurrents.js
const express = require('express');
const router = express.Router();
const RecurringPayment = require('../models/RecurringPayment');
const Account = require('../models/Account');
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');
const { ensureAuthenticated } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

// 1) LIST all recurring payments
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    const all = await RecurringPayment.find()
      .sort({ [sortField]: sortOrder })
      .populate('account', 'name')
      .populate('contact', 'name')
      .populate('deal', 'name')
      .lean();

    res.render('recurrents/index', {
      records: all,
      currentSort: sortField,
      currentOrder: sortOrder === 1 ? 'asc' : 'desc'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 2) SHOW form to create
router.get('/new', ensureAuthenticated, async (req, res) => {
  try {
    const [accounts, contacts, deals] = await Promise.all([
      Account.find().sort('name'),
      Contact.find().sort('name'),
      Deal.find().sort('name')
    ]);

    res.render('recurrents/new', {
      accounts,
      contacts,
      deals,
      account: '',
      contact: '',
      deal: '',
      recurringAmount: '',
      recurringPeriodMonths: '',
      firstPaymentDate: '',
      errors: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 3) HANDLE create
router.post('/', ensureAuthenticated, async (req, res) => {
  const {
    account,
    contact,
    deal,
    recurringAmount,
    recurringPeriodMonths,
    firstPaymentDate
  } = req.body;
  let errors = [];

  if (!account || !contact || !deal || !recurringAmount || !recurringPeriodMonths || !firstPaymentDate) {
    errors.push({ msg: 'Please fill in all required fields.' });
  }

  if (errors.length) {
    const [accounts, contacts, deals] = await Promise.all([
      Account.find().sort('name'),
      Contact.find().sort('name'),
      Deal.find().sort('name')
    ]);
    return res.render('recurrents/new', {
      accounts,
      contacts,
      deals,
      account,
      contact,
      deal,
      recurringAmount,
      recurringPeriodMonths,
      firstPaymentDate,
      errors
    });
  }

  try {
    await RecurringPayment.create({
      account,
      contact,
      deal,
      recurringAmount: Number(recurringAmount),
      recurringPeriodMonths: Number(recurringPeriodMonths),
      firstPaymentDate: new Date(firstPaymentDate)
    });
    req.flash('success_msg', 'Recurring payment created successfully');
    res.redirect('/recurrents');
  } catch (err) {
    console.error(err);
    const [accounts, contacts, deals] = await Promise.all([
      Account.find().sort('name'),
      Contact.find().sort('name'),
      Deal.find().sort('name')
    ]);
    res.render('recurrents/new', {
      accounts,
      contacts,
      deals,
      account,
      contact,
      deal,
      recurringAmount,
      recurringPeriodMonths,
      firstPaymentDate,
      errors: [{ msg: 'Error creating record; please try again.' }]
    });
  }
});

// 4) SHOW edit form
router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const rec = await RecurringPayment.findById(req.params.id)
      .populate('account', 'name')
      .populate('contact', 'name')
      .populate('deal', 'name')
      .lean();
    if (!rec) {
      req.flash('error_msg', 'Record not found');
      return res.redirect('/recurrents');
    }

    const [accounts, contacts, deals] = await Promise.all([
      Account.find().sort('name'),
      Contact.find().sort('name'),
      Deal.find().sort('name')
    ]);

    res.render('recurrents/edit', {
      record: rec,
      accounts,
      contacts,
      deals,
      errors: []
    });
  } catch (err) {
    console.error(err);
    res.redirect('/recurrents');
  }
});

// 5) HANDLE update
router.put('/:id', ensureAuthenticated, async (req, res) => {
  const { account, contact, deal, recurringAmount, recurringPeriodMonths, firstPaymentDate } = req.body;
  let errors = [];

  if (!account || !contact || !deal || !recurringAmount || !recurringPeriodMonths || !firstPaymentDate) {
    errors.push({ msg: 'Please fill in all required fields.' });
  }

  try {
    const rec = await RecurringPayment.findById(req.params.id);
    if (!rec) {
      req.flash('error_msg', 'Record not found');
      return res.redirect('/recurrents');
    }

    if (errors.length) {
      const [accounts, contacts, deals] = await Promise.all([
        Account.find().sort('name'),
        Contact.find().sort('name'),
        Deal.find().sort('name')
      ]);

      return res.render('recurrents/edit', {
        record: {
          _id: rec._id,
          account,
          contact,
          deal,
          recurringAmount,
          recurringPeriodMonths,
          firstPaymentDate: new Date(firstPaymentDate)
        },
        accounts,
        contacts,
        deals,
        errors
      });
    }

    rec.account = account;
    rec.contact = contact;
    rec.deal = deal;
    rec.recurringAmount = Number(recurringAmount);
    rec.recurringPeriodMonths = Number(recurringPeriodMonths);
    rec.firstPaymentDate = new Date(firstPaymentDate);
    await rec.save();

    req.flash('success_msg', 'Recurring payment updated successfully');
    res.redirect('/recurrents');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating record');
    res.redirect('/recurrents');
  }
});

// 6) DELETE
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    await RecurringPayment.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Recurring payment deleted');
    res.redirect('/recurrents');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error deleting record');
    res.redirect('/recurrents');
  }
});

// 7) IMPORT from XLSX
router.get('/import', ensureAuthenticated, (req, res) => {
  res.render('recurrents/import');
});

router.post('/import', ensureAuthenticated, upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Please select an Excel file');
    return res.redirect('/recurrents/import');
  }

  try {
    const rows = await parseExcelBuffer(req.file.buffer);

    const accountsByName = {};
    const contactsByName = {};
    const dealsByName = {};

    (await Account.find().select('name _id')).forEach(a => accountsByName[a.name] = a._id);
    (await Contact.find().select('name _id')).forEach(c => contactsByName[c.name] = c._id);
    (await Deal.find().select('name _id')).forEach(d => dealsByName[d.name] = d._id);

    const toInsert = [];
    let errorMsg = null;

    rows.forEach((r, idx) => {
      if (!accountsByName[r.account]) {
        errorMsg = `Unknown account in row ${idx + 2}: "${r.account}"`;
      } else if (!contactsByName[r.contact]) {
        errorMsg = `Unknown contact in row ${idx + 2}: "${r.contact}"`;
      } else if (!dealsByName[r.deal]) {
        errorMsg = `Unknown deal in row ${idx + 2}: "${r.deal}"`;
      } else {
        const amt = Number(r.recurringAmount);
        const per = Number(r.recurringPeriodMonths);
        const fpd = new Date(r.firstPaymentDate);
        if (isNaN(amt) || isNaN(per) || isNaN(fpd.getTime())) {
          errorMsg = `Invalid numeric/date field in row ${idx + 2}`;
        } else {
          toInsert.push({
            account: accountsByName[r.account],
            contact: contactsByName[r.contact],
            deal: dealsByName[r.deal],
            recurringAmount: amt,
            recurringPeriodMonths: per,
            firstPaymentDate: fpd
          });
        }
      }
    });

    if (errorMsg) {
      req.flash('error_msg', errorMsg);
      return res.redirect('/recurrents/import');
    }

    await RecurringPayment.insertMany(toInsert);
    req.flash('success_msg', 'Imported successfully');
    res.redirect('/recurrents');
  } catch (err) {
    console.error('Import error:', err);
    req.flash('error_msg', 'Failed to import. Please check file format.');
    res.redirect('/recurrents/import');
  }
});

// 8) EXPORT to XLSX
router.get('/export', ensureAuthenticated, async (req, res) => {
  try {
    const all = await RecurringPayment.find()
      .populate('account', 'name')
      .populate('contact', 'name')
      .populate('deal', 'name')
      .sort('-createdAt')
      .lean();

    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('RecurringPayments');

    ws.columns = [
      { header: 'Account Name', key: 'account', width: 25 },
      { header: 'Contact Name', key: 'contact', width: 25 },
      { header: 'Deal Name', key: 'deal', width: 25 },
      { header: 'Amount (₹)', key: 'recurringAmount', width: 15 },
      { header: 'Period (months)', key: 'recurringPeriodMonths', width: 15 },
      { header: 'First Payment Date', key: 'firstPaymentDate', width: 20 }
    ];

    all.forEach(rp => {
      ws.addRow({
        account: rp.account?.name || '',
        contact: rp.contact?.name || '',
        deal: rp.deal?.name || '',
        recurringAmount: rp.recurringAmount,
        recurringPeriodMonths: rp.recurringPeriodMonths,
        firstPaymentDate: rp.firstPaymentDate.toISOString().split('T')[0]
      });
    });

    const now = new Date();
    const ts = now.toISOString().replace(/[-T:\.Z]/g, '').slice(0, 14);
    const filename = `recurrents_${ts}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to export data');
    res.redirect('/recurrents');
  }
});

module.exports = router;
