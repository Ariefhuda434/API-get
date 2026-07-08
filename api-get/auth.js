const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return next();
  }
  const accept = req.headers.accept || '';
  if (req.xhr || accept.includes('json') || accept.includes('event-stream')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.redirect('/login.html');
};

module.exports = { requireAuth };
