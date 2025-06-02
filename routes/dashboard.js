const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/auth');

// GET /dashboard → render admin dashboard
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        // 1) Figure out which owners’ data this user can see (hierarchy):
        //    - Always include the current user’s own _id.
        //    - Also include any direct reports whose manager_id === currentUser.emp_id.

        const currentUserId = req.user._id;
        const currentEmpId = req.user.emp_id;


        // Find all direct reports (users whose manager_id matches current emp_id)
        const directReports = await User.find(
            { manager_id: currentEmpId },
            '_id'
        ).lean();

        // Build array of ObjectId's: [ currentUserId, ...directReportIds ]
        const ownersToInclude = [currentUserId];
        directReports.forEach(u => ownersToInclude.push(u._id));

        // 1) Total Leads
        const totalLeads = await Lead.countDocuments({
            owner: { $in: ownersToInclude }
        });

        // 2) Total Deals
        const totalDeals = await Deal.countDocuments({
            owner: { $in: ownersToInclude }
        });

        // 3) Average Deal Size
        //    Use aggregation to compute the average of `amount` over all deals
        const avgDealResult = await Deal.aggregate([
            { $match: { owner: { $in: ownersToInclude } } },
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
        const activeRepIds = await Deal.distinct('owner', {
            owner: { $in: ownersToInclude }
        });
        const numberOfActiveReps = activeRepIds.length;

        // 6) “Upcoming Deals Next Month”:
        //    We need to find all deals (for these owners)
        //    whose due_date is in the next calendar month.
        //    Then count them and sum their amounts.

        const now = new Date();
        // Start of next month:
        const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        // Start of month after next:
        const startOfMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

        //  a) Count how many deals fall in [startOfNextMonth, startOfMonthAfter)
        const nextMonthDealsCount = await Deal.countDocuments({
            owner: { $in: ownersToInclude },
            due_date: { $gte: startOfNextMonth, $lt: startOfMonthAfter }
        });

        //  b) Sum the amounts of those same deals:
        const nextMonthAmountResult = await Deal.aggregate([
            {
                $match: {
                    owner: { $in: ownersToInclude },
                    due_date: { $gte: startOfNextMonth, $lt: startOfMonthAfter }
                }
            },
            { $group: { _id: null, totalAmt: { $sum: '$amount' } } }
        ]);
        const nextMonthDealsAmount = nextMonthAmountResult.length > 0
            ? Number(nextMonthAmountResult[0].totalAmt)
            : 0;


        // 6) Leads vs. Deals per Sales Rep (for bar chart)
        //    a) Aggregate leads by owner
        const leadsAgg = await Lead.aggregate([
            { $match: { owner: { $in: ownersToInclude } } },
            { $group: { _id: '$owner', count: { $sum: 1 } } }
        ]);
        //    b) Aggregate deals by owner
        const dealsAgg = await Deal.aggregate([
            { $match: { owner: { $in: ownersToInclude } } },
            { $group: { _id: '$owner', count: { $sum: 1 } } }
        ]);

        //    c) Build a unified set of all rep IDs that appear in either leadsAgg or dealsAgg
        const allRepIdsSet = new Set([
            ...leadsAgg.map((item) => item._id.toString()),
            ...dealsAgg.map((item) => item._id.toString())
        ]);

        const allRepIds = Array.from(allRepIdsSet);

        //    d) Fetch those users’ names
        const reps = await User.find({ _id: { $in: allRepIds } }, 'name').lean();

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
            leadConversionRate, //not required anymore
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
