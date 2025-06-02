const express = require('express');
const router  = express.Router();
const Lead    = require('../models/Lead');
const Deal    = require('../models/Deal');
const User    = require('../models/User');
const { ensureAuthenticated } = require('../middleware/auth');

// GET /dashboard → render admin dashboard
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // 1) Total Leads
    const totalLeads = await Lead.countDocuments();

    // 2) Total Deals
    const totalDeals = await Deal.countDocuments();

    // 3) Average Deal Size
    //    Use aggregation to compute the average of `amount` over all deals
    const avgDealResult = await Deal.aggregate([
      { $group: { _id: null, avgSize: { $avg: '$amount' } } }
    ]);
    const avgDealSize = avgDealResult.length > 0
      ? Number(avgDealResult[0].avgSize.toFixed(2))
      : 0;

    // 4) Lead Conversion Rate = (totalDeals / totalLeads) * 100
    const leadConversionRate = totalLeads > 0
      ? Number(((totalDeals / totalLeads) * 100).toFixed(1))
      : 0;

    // 5) Number of Active Sales Reps
    //    Define “active” as having at least one Deal. We’ll get distinct owners from the Deal collection.
    const activeRepIds = await Deal.distinct('owner');
    const numberOfActiveReps = activeRepIds.length;

    // 6) Leads vs. Deals per Sales Rep (for bar chart)
    //    a) Aggregate leads by owner
    const leadsAgg = await Lead.aggregate([
      { $group: { _id: '$owner', count: { $sum: 1 } } }
    ]);
    //    b) Aggregate deals by owner
    const dealsAgg = await Deal.aggregate([
      { $group: { _id: '$owner', count: { $sum: 1 } } }
    ]);

    //    c) Build a unified set of all rep IDs that appear in either leadsAgg or dealsAgg
    const allRepIdsSet = new Set([
      ...leadsAgg.map((item) => item._id.toString()),
      ...dealsAgg.map((item) => item._id.toString())
    ]);

    const allRepIds = Array.from(allRepIdsSet);

    //    d) Fetch those users’ names
    const reps = await User.find({ _id: { $in: allRepIds } }).select('name');

    //    e) Build a map from userId → name
    const nameById = {};
    reps.forEach((u) => {
      nameById[u._id.toString()] = u.name;
    });

    //    f) Create two parallel arrays: labels[], leadsData[], dealsData[] in the same order
    const labels = [];      // [ 'Alice', 'Bob', ... ]
    const leadsData = [];   // [ 5,  12, ... ]
    const dealsData = [];   // [ 3,   7, ... ]

    allRepIds.forEach((repId) => {
      labels.push(nameById[repId] || 'Unknown');
      // find lead count for this rep
      const leadObj = leadsAgg.find((o) => o._id.toString() === repId);
      leadsData.push(leadObj ? leadObj.count : 0);
      // find deal count for this rep
      const dealObj = dealsAgg.find((o) => o._id.toString() === repId);
      dealsData.push(dealObj ? dealObj.count : 0);
    });

    // Render the dashboard view, passing all values
    res.render('dashboard', {
      totalLeads,
      totalDeals,
      avgDealSize,
      leadConversionRate,
      numberOfActiveReps,
      repLabels: JSON.stringify(labels),
      repLeads: JSON.stringify(leadsData),
      repDeals: JSON.stringify(dealsData)
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
