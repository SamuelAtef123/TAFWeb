const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { authUser, authAdmin } = require('../middleware/auth');

// Create an order for the logged-in user. The client only sends product ids and
// quantities; the total is always computed on the server from DB prices.
router.post('/', authUser, async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'products must be a non-empty array' });
  }

  // Validate items and merge duplicate product ids
  const quantities = new Map();
  for (const item of products) {
    const id = item && item.product;
    const qty = item && item.quantity;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Each item needs a valid product id' });
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ message: 'quantity must be an integer between 1 and 100' });
    }
    quantities.set(String(id), (quantities.get(String(id)) || 0) + qty);
  }

  const dbProducts = await Product.find({ _id: { $in: [...quantities.keys()] } });
  if (dbProducts.length !== quantities.size) {
    return res.status(400).json({ message: 'One or more products do not exist' });
  }

  let totalCents = 0;
  const items = dbProducts.map(p => {
    const quantity = quantities.get(String(p._id));
    totalCents += Math.round(p.price * 100) * quantity;
    return { product: p._id, quantity };
  });
  const total = totalCents / 100;

  const order = await Order.create({ user: req.user.id, products: items, total });

  // Update user score: 1 point per $10
  const points = Math.floor(total / 10);
  if (points > 0) await User.findByIdAndUpdate(req.user.id, { $inc: { score: points } });

  res.status(201).json(order);
});

router.get('/', authAdmin, async (req, res) => {
  const orders = await Order.find().populate('user', 'email score').populate('products.product');
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
  const orders = await Order.find({ user: userId }).populate('products.product');
  res.json(orders);
});

module.exports = router;
