const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/auth');
//get all tasks
router.get('/', ensureAuthenticated, async (req, res) => {
    const tasks = await Task.find().populate('assigned_by', 'name');
    res.render('tasks/index', { tasks });
});

// create form
router.get('/new', ensureAuthenticated, async (req, res) => {
    try {
        const users = await User.find({}, 'name');
        res.render('tasks/new', { users });
    } catch (err) {
        console.error(err);
        res.redirect('/tasks');
    }
});

// create task
router.post('/', ensureAuthenticated, async (req, res) => {
    try {
        const { title, description, due_date, priority, status, assigned_by } = req.body;

        const task = new Task({
            title,
            description,
            due_date,
            priority,
            status,
            assigned_by: assigned_by || null // optional
        });
        await task.save();
        res.redirect('/tasks')
    } catch (err) {
        console.error(`Can't form task now.... Please try again later`);
        res.status(500).send('Server Error');
    }
});

//edit form
router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
    const task = await Task.findById(req.params.id);
    const users = await User.find({}, 'name');
    res.render('tasks/edit', { task, users });
  } catch (err) {
    console.error(err);
    res.redirect('/tasks');
  }
});

// Update task
router.post('/:id/edit', async (req, res) => {
    await Task.findByIdAndUpdate(req.params.id, req.body);
    res.redirect('/tasks');
});

// Delete task
router.post('/:id/delete', async (req, res) => {
    await Task.findByIdAndDelete(req.params.id);
    res.redirect('/tasks');
});

module.exports = router;