const mongoose = require('mongoose');
const TaskSchema = new mongoose.Schema({
    title : {type: String, required : true},
    description : {type: String},
    due_date : {type: Date, default: Date.now()},
    priority : {type: String, enum: ['Low', 'High', 'Med'], required: true},
    status : {type : String, enum: ['Pending', 'In-Progess', 'Completed']},
    assigned_by : {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    createdAt : {type: Date, default: Date.now()}
});

module.exports = mongoose.model('Task', TaskSchema);