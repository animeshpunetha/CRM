const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const session = require('express-session');
const flash   = require('connect-flash');

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(flash());

// expose flash to all views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg   = req.flash('error_msg');
  res.locals.errors      = req.flash('errors');
  next();
});

//MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(()=>{
    console.log('MongoDB connected');
}).catch(err=> console.log(err));

//Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({extended : true}));
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const contactRoutes = require('./routes/contacts');
const leadRoutes = require('./routes/leads');
const dealRoutes = require('./routes/deals');
const accountRoutes = require('./routes/accounts');

// Routes
app.use('/users', require('./routes/users'));
app.use('/contacts', contactRoutes);
app.use('/leads', leadRoutes);
app.use('/deals', dealRoutes);
app.use('/accounts', accountRoutes);

//Home route
app.get('/', (req,res)=>{
    res.send('CRM App Home Page');
});

//Start Server
app.listen(PORT,()=>{
    console.log(`Server is running on http://localhost:${PORT}`);
});
