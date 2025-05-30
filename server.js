const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash   = require('connect-flash');
const passport = require('passport');
const path = require('path');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');

const app = express();
const PORT = process.env.PORT || 3000;

//Passport config
require('./config/passport')(passport);

//MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(()=>{
    console.log('MongoDB connected');
}).catch(err=> console.log(err));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Bodyparser & static
app.use(express.json());
app.use(bodyParser.urlencoded({extended : true}));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 0.5 * 60 * 60 * 1000 // 0.5 hours in milliseconds
  }
}));

// Passport middlewares
app.use(passport.initialize());
app.use(passport.session());

// flash message
app.use(flash());

// expose flash to all views
app.use((req, res, next) => {
  res.locals.user        = req.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg   = req.flash('error_msg');
  res.locals.errors      = req.flash('errors');
  next();
});

if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
  console.warn('⚠️  MAIL_USER or MAIL_PASS not set. Password reset emails will fail.');
}

// Auth & Guard middlewares
app.use('/auth', require('./routes/auth'));
// PROTECTED routes
const { ensureAuthenticated } = require('./middleware/auth');



// Redirect root to /dashboard if someone hits '/'
app.use('/users',    ensureAuthenticated, require('./routes/users'));
app.use('/contacts', ensureAuthenticated, require('./routes/contacts'));
app.use('/leads',    ensureAuthenticated, require('./routes/leads'));
app.use('/deals',    ensureAuthenticated, require('./routes/deals'));
app.use('/accounts', ensureAuthenticated, require('./routes/accounts'));
app.use('/tasks', ensureAuthenticated, require('./routes/tasks'));


//Start Server
app.listen(PORT,()=>{
    console.log(`Server is running on http://localhost:${PORT}`);
});
