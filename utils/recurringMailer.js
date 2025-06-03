// utils/recurringMailer.js
const dotenv = require('dotenv');
dotenv.config();
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const RecurringPayment = require('../models/RecurringPayment');
const User = require('../models/User'); // to get admin’s email, or use process.env

// You can configure transport however you have done elsewhere in your app:
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// Helper: send notification to the portal manager
async function sendReminderEmail(rp, nextDate) {
  // You can choose any “managing email”—for simplicity, we’ll send to MAIL_USER
  const toEmail = process.env.MAIL_USER;
  const accountName = rp.account.name || rp.account.toString();
  const contactName = rp.contact.name || rp.contact.toString();
  const dealName = rp.deal.name || rp.deal.toString();
  const subject = `Upcoming Recurring Payment in 2 months: ${accountName}`;
  const text = `
Hello,

This is a reminder that the next recurring payment for:

• Company: ${accountName}
• Contact: ${contactName}
• Deal:    ${dealName}
• Amount:  ₹${rp.recurringAmount.toLocaleString('en-IN')}

is scheduled on ${nextDate.toDateString()} (exactly two months from today).

Please ensure that your team takes the necessary follow-up actions.

—
CRM System
  `.trim();

  await transporter.sendMail({ to: toEmail, subject, text });
}

// Cron job: run once per day at 00:00
function startRecurringEmailJob() {
  cron.schedule('0 0 * * *', async () => {
    try {
      const all = await RecurringPayment.find()
        .populate('account', 'name')
        .populate('contact', 'name')
        .populate('deal', 'name')
        .lean();

      const today = new Date();

      for (const rp of all) {
        // rp is a plain object here; to use computeNextPaymentDate, instantiate a Model object:
        const doc = new RecurringPayment(rp);
        const nextDate = doc.computeNextPaymentDate();

        // Calculate “twoMonthsBefore” by subtracting 2 months from nextDate
        const twoMonthsBefore = new Date(nextDate);
        twoMonthsBefore.setMonth(twoMonthsBefore.getMonth() - 2);

        // Check if twoMonthsBefore is exactly today (allow a tolerance window of ±1 day)
        const diffDays = Math.floor((twoMonthsBefore - today) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
          // It’s exactly two months away → send email
          await sendReminderEmail(rp, nextDate);
        }
      }
    } catch (err) {
      console.error('RecurringPayment cron error:', err);
    }
  });
}

module.exports = { startRecurringEmailJob };
