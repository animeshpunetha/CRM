const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const User = require('../models/User');

// GET /accounts
router.get('/', async (req, res) => {
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
router.get('/new', async (req, res) => {
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
router.post('/', async (req, res) => {
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

module.exports = router;
