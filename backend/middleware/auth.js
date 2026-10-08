const jwt = require('jsonwebtoken');

const getDecodedToken = (req, res) => {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ message: 'No token' });
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
    return null;
  }
};

// Any logged-in user. Sets req.user = { id, isAdmin }
const authUser = (req, res, next) => {
  const decoded = getDecodedToken(req, res);
  if (!decoded) return;
  if (!decoded.userId) return res.status(401).json({ message: 'Invalid token' });
  req.user = { id: decoded.userId, isAdmin: !!decoded.isAdmin };
  next();
};

// Admin only (works with both the admin-password token and an admin user's token)
const authAdmin = (req, res, next) => {
  const decoded = getDecodedToken(req, res);
  if (!decoded) return;
  if (!decoded.isAdmin) return res.status(403).json({ message: 'Not admin' });
  req.user = { id: decoded.userId, isAdmin: true };
  next();
};

module.exports = { authUser, authAdmin };
