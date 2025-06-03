// routes/dashboard.js
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/auth');

// GET /dashboard → render admin dashboard
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // Check if current user is a super_admin
    const isSuperAdmin = req.user.role === 'super_admin';

    // ownersToInclude: if super_admin, we’ll skip filtering by owner entirely
    let ownersToInclude = [];

    if (!isSuperAdmin) {
      // 1) Build array of ObjectId's: [ currentUserId, ...directReportIds ]
      const currentUserId = req.user._id;
      const currentEmpId = req.user.emp_id;

      // Find all direct reports (users whose manager_id matches currentUser.emp_id)
      const directReports = await User.find(
        { manager_id: currentEmpId },
        '_id'
      ).lean();

      ownersToInclude = [currentUserId];
      directReports.forEach((u) => ownersToInclude.push(u._id));
    }

    //
    // ─── 1) TOTAL LEADS ────────────────────────────────────────────────────
    //
    let totalLeads;
    if (isSuperAdmin) {
      totalLeads = await Lead.countDocuments({});
    } else {
      totalLeads = await Lead.countDocuments({
        owner: { $in: ownersToInclude }
      });
    }

    //
    // ─── 2) TOTAL DEALS ────────────────────────────────────────────────────
    //
    let totalDeals;
    if (isSuperAdmin) {
      totalDeals = await Deal.countDocuments({});
    } else {
      totalDeals = await Deal.countDocuments({
        owner: { $in: ownersToInclude }
      });
    }

    //
    // ─── 3) AVERAGE DEAL SIZE ───────────────────────────────────────────────
    //
    let avgDealSize = 0;
    if (isSuperAdmin) {
      // Aggregate over all deals
      const avgDealResult = await Deal.aggregate([
        { $group: { _id: null, avgSize: { $avg: '$amount' } } }
      ]);
      avgDealSize =
        avgDealResult.length > 0
          ? Number(avgDealResult[0].avgSize.toFixed(2))
          : 0;
    } else {
      // Aggregate over filtered deals
      const avgDealResult = await Deal.aggregate([
        { $match: { owner: { $in: ownersToInclude } } },
        { $group: { _id: null, avgSize: { $avg: '$amount' } } }
      ]);
      avgDealSize =
        avgDealResult.length > 0
          ? Number(avgDealResult[0].avgSize.toFixed(2))
          : 0;
    }

    //
    // ─── 4) NUMBER OF ACTIVE SALES REPS ────────────────────────────────────
    //
    // We define “active” as having at least one Deal. So we look for distinct owners in “Deal.”
    let activeRepIds;
    if (isSuperAdmin) {
      activeRepIds = await Deal.distinct('owner', {});
    } else {
      activeRepIds = await Deal.distinct('owner', {
        owner: { $in: ownersToInclude }
      });
    }
    const numberOfActiveReps = activeRepIds.length;

    //
    // ─── 5) UPCOMING DEALS NEXT MONTH ─────────────────────────────────────
    //
    const now = new Date();
    // Start of next month:
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    // Start of month after next:
    const startOfMonthAfter = new Date(
      now.getFullYear(),
      now.getMonth() + 2,
      1
    );

    let nextMonthDealsCount = 0;
    let nextMonthDealsAmount = 0;

    if (isSuperAdmin) {
      // Count & sum over all deals
      nextMonthDealsCount = await Deal.countDocuments({
        due_date: { $gte: startOfNextMonth, $lt: startOfMonthAfter }
      });

      const nextMonthAmountResult = await Deal.aggregate([
        {
          $match: {
            due_date: { $gte: startOfNextMonth, $lt: startOfMonthAfter }
          }
        },
        { $group: { _id: null, totalAmt: { $sum: '$amount' } } }
      ]);
      nextMonthDealsAmount =
        nextMonthAmountResult.length > 0
          ? Number(nextMonthAmountResult[0].totalAmt)
          : 0;
    } else {
      // Filtered by ownersToInclude
      nextMonthDealsCount = await Deal.countDocuments({
        owner: { $in: ownersToInclude },
        due_date: { $gte: startOfNextMonth, $lt: startOfMonthAfter }
      });

      const nextMonthAmountResult = await Deal.aggregate([
        {
          $match: {
            owner: { $in: ownersToInclude },
            due_date: { $gte: startOfNextMonth, $lt: startOfMonthAfter }
          }
        },
        { $group: { _id: null, totalAmt: { $sum: '$amount' } } }
      ]);
      nextMonthDealsAmount =
        nextMonthAmountResult.length > 0
          ? Number(nextMonthAmountResult[0].totalAmt)
          : 0;
    }

    //
    // ─── 6) LEADS VS. DEALS PER SALES REP (for bar chart) ───────────────────
    //
    // We still want to show a per‐rep breakdown, but if super_admin, include everyone;
    // otherwise only include ownersToInclude.

    // (a) Aggregate leads by owner
    const leadsMatch = isSuperAdmin
      ? {}
      : { owner: { $in: ownersToInclude } };
    const leadsAgg = await Lead.aggregate([
      { $match: leadsMatch },
      { $group: { _id: '$owner', count: { $sum: 1 } } }
    ]);

    // (b) Aggregate deals by owner
    const dealsMatch = isSuperAdmin
      ? {}
      : { owner: { $in: ownersToInclude } };
    const dealsAgg = await Deal.aggregate([
      { $match: dealsMatch },
      { $group: { _id: '$owner', count: { $sum: 1 } } }
    ]);

    // (c) Build a unified set of all rep IDs that appear in either
    const allRepIdsSet = new Set([
      ...leadsAgg.map((item) => item._id.toString()),
      ...dealsAgg.map((item) => item._id.toString())
    ]);
    const allRepIds = Array.from(allRepIdsSet);

    // (d) Fetch those users’ names
    const reps = await User.find(
      { _id: { $in: allRepIds } },
      'name'
    ).lean();

    // (e) Build a map from userId → name
    const nameById = {};
    reps.forEach((u) => {
      nameById[u._id.toString()] = u.name;
    });

    // (f) Create two parallel arrays: labels[], leadsData[], dealsData[]
    const labels = []; // [ 'Alice', 'Bob', ... ]
    const leadsData = []; // [ 5,  12, ... ]
    const dealsData = []; // [ 3,   7, ... ]

    allRepIds.forEach((repId) => {
      labels.push(nameById[repId] || 'Unknown');
      // find lead count for this rep
      const leadObj = leadsAgg.find((o) => o._id.toString() === repId);
      leadsData.push(leadObj ? leadObj.count : 0);
      // find deal count for this rep
      const dealObj = dealsAgg.find((o) => o._id.toString() === repId);
      dealsData.push(dealObj ? dealObj.count : 0);
    });

    //
    // ─── RENDER THE DASHBOARD VIEW ───────────────────────────────────────────
    //
    res.render('dashboard', {
      totalLeads,
      totalDeals,
      avgDealSize,
      numberOfActiveReps,
      nextMonthDealsCount,
      nextMonthDealsAmount,
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
