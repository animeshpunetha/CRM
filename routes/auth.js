const express  = require('express');
const crypto     = require('crypto');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const User       = require('../models/User');
const { forwardAuthenticated } = require('../middleware/auth');
const router   = express.Router();
const passport = require('passport');

// Show login form
router.get('/login', (req, res) => {
  res.render('auth/login');
});

// Handle login
router.post(
  '/login',
  passport.authenticate('local', {
    successRedirect: '/accounts',
    failureRedirect: '/auth/login',
    failureFlash: true
  })
);

// Logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    req.flash('success_msg', 'You are logged out');
    res.redirect('/auth/login');
  });
});

// GET forgot form
router.get('/forgot-password', forwardAuthenticated, (req, res) => {
  res.render('auth/forgot-password');
});

// POST forgot: generate token & send email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    req.flash('error_msg', 'No account with that email found.');
    return res.redirect('/auth/forgot-password');
  }

  // 1) Generate a token
  const token = crypto.randomBytes(20).toString('hex');
  // 2) Set it and expiry (1 hour)
  user.resetPasswordToken   = token;
  user.resetPasswordExpires = Date.now() + 3600000;
  await user.save();

  // 3) Send email
  const transporter = nodemailer.createTransport({
    // e.g. Gmail SMTP, or configure your own
    service: 'Gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  const resetURL = `http://${req.headers.host}/auth/reset-password/${token}`;
  const mailOptions = {
    to:      user.email,
    from:    process.env.MAIL_USER,
    subject: 'CRM Password Reset',
    text:    `You’re receiving this because you (or someone else) requested a password reset.\n\n
Please click the following link, or paste it into your browser to complete the process:\n\n
${resetURL}\n\n
If you did not request this, please ignore.\n`
  };

  transporter.sendMail(mailOptions, err => {
    if (err) {
      console.error('Mail error:', err);
      req.flash('error_msg','Error sending reset email.');
      return res.redirect('/auth/forgot-password');
    }
    req.flash('success_msg', `An email has been sent to ${user.email} with further instructions.`);
    res.redirect('/auth/login');
  });
});

// GET reset form
router.get('/reset-password/:token', forwardAuthenticated, async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken:   req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    req.flash('error_msg','Password reset token is invalid or expired.');
    return res.redirect('/auth/forgot-password');
  }
  res.render('auth/reset-password', { token: req.params.token });
});

// POST reset: update password
router.post('/reset-password/:token', async (req, res) => {
  const { password, password2 } = req.body;
  const user = await User.findOne({
    resetPasswordToken:   req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    req.flash('error_msg','Password reset token is invalid or expired.');
    return res.redirect('/auth/forgot-password');
  }
  if (!password || password !== password2) {
    req.flash('error_msg','Passwords do not match.');
    return res.redirect('back');
  }

  // 1) Hash & set new password
  user.password             = await bcrypt.hash(password, 10);
  user.resetPasswordToken   = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  req.flash('success_msg','Password has been reset. You can now log in.');
  res.redirect('/auth/login');
});


module.exports = router;
