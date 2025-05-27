const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const User = require('../models/User');
const Account = require('../models/Account');
const Contact = require('../models/Contact');

// GET /deals
router.get('/', async (req, res) => {
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
router.get('/new', async (req, res) => {
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
router.post('/', async (req, res) => {
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

module.exports = router;
