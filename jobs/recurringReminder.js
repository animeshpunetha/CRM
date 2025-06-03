// jobs/recurringReminder.js
const cron = require('node-cron');
const RecurringPayment = require('../models/RecurringPayment');
const { sendMail } = require('../utils/recurringMailer');

/**
 * Utility to zero‐out time from a Date object
 * so we compare only year, month, day (no hours/minutes).
 */
function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Schedule: “0 0 * * *” → runs every day at 00:00 (server time).
 * (If you need a different time, adjust the cron expression accordingly.)
 */
cron.schedule('0 0 * * *', async () => {
  try {
    const today = stripTime(new Date());
    // Compute the target date exactly two months from today
    const twoMonthsOut = new Date(today);
    twoMonthsOut.setMonth(twoMonthsOut.getMonth() + 2);

    // Because setMonth can “roll over” if the current day > days in target month,
    // we normalize again:
    const targetDate = stripTime(twoMonthsOut);

    // Find all payments whose nextPaymentDate matches targetDate (same day).
    const matchingPayments = await RecurringPayment.find({
      nextPaymentDate: {
        $gte: targetDate,
        $lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
      }
    }).lean();

    if (matchingPayments.length === 0) {
      console.log(`[RecurringReminder] No payments due in two months (Date: ${targetDate.toDateString()})`);
      return;
    }

    // Construct an HTML table of upcoming payments
    let htmlTable = `
      <h3>Recurring Payments Coming Up on ${targetDate.toDateString()}</h3>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
        <thead>
          <tr>
            <th>Company Name</th>
            <th>Contact Name</th>
            <th>Deal Name</th>
            <th>Amount</th>
            <th>Period (months)</th>
            <th>Next Payment Date</th>
          </tr>
        </thead>
        <tbody>
    `;
    matchingPayments.forEach((rp) => {
      htmlTable += `
        <tr>
          <td>${rp.companyName}</td>
          <td>${rp.contactName}</td>
          <td>${rp.dealName}</td>
          <td>${rp.recurringAmount.toFixed(2)}</td>
          <td>${rp.period}</td>
          <td>${new Date(rp.nextPaymentDate).toDateString()}</td>
        </tr>
      `;
    });
    htmlTable += `</tbody></table>`;

    // Send email to the portal manager
    await sendMail({
      to: process.env.PORTAL_MANAGER_EMAIL, 
      subject: `Reminder: ${matchingPayments.length} Recurring Payment(s) Due in Two Months`,
      text: `You have ${matchingPayments.length} recurring payment(s) coming up on ${targetDate.toDateString()}. Please check the CRM portal for details.`,
      html: htmlTable
    });

    console.log(`[RecurringReminder] Sent reminder email for ${matchingPayments.length} payment(s) due on ${targetDate.toDateString()}`);
  } catch (err) {
    console.error('[RecurringReminder] Error while checking recurring payments:', err);
  }
});
