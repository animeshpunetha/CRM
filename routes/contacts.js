const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const User = require('../models/User'); // ⬅️ Import User model
const Excel = require('exceljs');
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelImporter');

// Set up multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// GET /contacts → list all contacts
router.get('/', async (req, res) => {
    const contacts = await Contact.find()
        .sort('-createdAt')
        .populate('owner', 'name'); // Optional: populate owner if referenced
    res.render('contacts/index', { contacts });
});

// GET /contacts/new → render form to add a new contact
router.get('/new', async (req, res) => {
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
router.post('/', async (req, res) => {
    const { owner, name, company, email, phone } = req.body;
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
        await Contact.create({ owner, name, company, email, phone });
        req.flash('success_msg', 'Contact created successfully...');
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
router.get('/import', async (req, res) => {
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

module.exports = router;
