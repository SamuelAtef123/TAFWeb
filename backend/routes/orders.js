const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { authUser, authAdmin } = require('../middleware/auth');

const CODE_RE = /^[A-Za-z0-9_-]{2,24}$/;

// Create an order for the logged-in user.
// Each line is { product: <Mongo id> } or { code: 'COL001' } (or the code passed as `product`),
// plus a quantity. The total is always computed here from the database prices.
router.post('/', authUser, async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'products must be a non-empty array' });
  }
  if (products.length > 100) {
    return res.status(400).json({ message: 'Too many items in one order' });
  }

  // 1) validate each line and work out how we will look the product up
  const lines = [];
  const ids = [];
  const codes = [];
  for (const item of products) {
    const ref = item && (item.product ?? item.code);
    const qty = item && item.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ message: 'quantity must be an integer between 1 and 100' });
    }
    if (typeof ref === 'string' && mongoose.isValidObjectId(ref)) {
      ids.push(ref);
      lines.push({ by: 'id', ref, qty });
    } else if (typeof ref === 'string' && CODE_RE.test(ref)) {
      codes.push(ref.toUpperCase());
      lines.push({ by: 'code', ref: ref.toUpperCase(), qty });
    } else {
      return res.status(400).json({ message: 'Each item needs a valid product id or code' });
    }
  }

  // 2) load every referenced product in one query
  const found = await Product.find({
    $or: [{ _id: { $in: ids } }, { code: { $in: codes } }]
  });
  const byId = new Map(found.map(p => [String(p._id), p]));
  const byCode = new Map(found.filter(p => p.code).map(p => [p.code, p]));

  // 3) resolve each line to a product and merge duplicates (an id and a code can be the same product)
  const quantities = new Map();
  for (const line of lines) {
    const product = line.by === 'id' ? byId.get(line.ref) : byCode.get(line.ref);
    if (!product) {
      return res.status(400).json({ message: `Unknown product: ${line.ref}` });
    }
    if (product.available === false) {
      return res.status(400).json({ message: `${product.name} is not available right now` });
    }
    const key = String(product._id);
    quantities.set(key, (quantities.get(key) || 0) + line.qty);
  }

  // 4) price it on the server (in piastres, to avoid floating point errors)
  let totalCents = 0;
  const items = [];
  for (const [key, quantity] of quantities) {
    const product = byId.get(key);
    totalCents += Math.round(product.price * 100) * quantity;
    items.push({ product: product._id, quantity });
  }
  const total = totalCents / 100;

  const order = await Order.create({ user: req.user.id, products: items, total });

  // Update user score: 1 point per 10 EGP
  const points = Math.floor(total / 10);
  if (points > 0) await User.findByIdAndUpdate(req.user.id, { $inc: { score: points } });

  res.status(201).json({ ...order.toObject(), pointsEarned: points });
});

router.get('/', authAdmin, async (req, res) => {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .populate('user', 'email score')
    .populate('products.product');
  res.json(orders);
});

// A user can see their own orders; admins can see anyone's
router.get('/user/:userId', authUser, async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  if (userId !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const orders = await Order.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate('products.product');
  res.json(orders);
});

module.exports = router;
