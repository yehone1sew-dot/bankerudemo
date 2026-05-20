module.exports = function httpsRedirect(req, res, next) {
  const host = req.header('host') || '';
  if (!host.includes('localhost') && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${host}${req.url}`);
  }
  next();
};
