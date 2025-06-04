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

  /**
   * Accepts either a single role string or an array of role strings.
   * Optionally takes an options object with { redirectBack: true|false }.
   *
   * Usage:
   *   ensureRole('admin')
   *   ensureRole(['admin','super_admin'], { redirectBack: true })
   */
  ensureRole: (roles, options = {}) => (req, res, next) => {
    // Normalize roles into an array
    const allowed = Array.isArray(roles) ? roles : [roles];

    // If user is logged in and their role is in the allowed list, proceed
    if (req.user && allowed.includes(req.user.role)) {
      return next();
    }

    // Otherwise, not authorized
    req.flash('error_msg', 'You do not have permission to use that resource');

    // Redirect back if requested, otherwise send to home
    if (options.redirectBack) {
      const backURL = req.get('Referer');
      return res.redirect(backURL || '/');
    }

    return res.redirect('/');
  }
};

