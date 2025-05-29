// module.exports = {
//   ensureAuthenticated: (req, res, next) => {
//     if (req.isAuthenticated()) return next();
//     req.flash('error_msg', 'Please log in to view that resource');
//     res.redirect('/auth/login');
//   },
//   forwardAuthenticated: (req, res, next) => {
//     if (!req.isAuthenticated()) return next();
//     res.redirect('/dashboard');      
//   },
//   ensureRole: (role) => (req, res, next) => {
//     if (req.user && req.user.role === role) return next();
//     req.flash('error_msg', 'You do not have permission to view that resource');
//     res.redirect('/');
//   }
// };
// middleware/auth.js

module.exports = {
  ensureAuthenticated: (req, res, next) => {
    if (req.isAuthenticated()) return next();
    req.flash('error_msg', 'Please log in to view/use that resource');
    res.redirect('/auth/login');
  },

  forwardAuthenticated: (req, res, next) => {
    if (!req.isAuthenticated()) return next();
    res.redirect('/dashboard');
  },

  ensureRole: (role) => (req, res, next) => {
    if (req.user && req.user.role === role) {
      return next();
    }

    // Not authorized
    req.flash('error_msg', 'You do not have permission to use that resource');

    // Redirect back if possible, otherwise to root
    const back = req.get('Referer');
    res.redirect(back || '/');
  }
};
