const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const authAdmin = require('./auth'); // Reuse auth middleware

router.post('/', async (req, res) => {
  const { userId, products, total } = req.body;
  const order = new Order({ user: userId, products, total });
  await order.save();
  // Update user score: 1 point per $10
  const points = Math.floor(total / 10);
  await User.findByIdAndUpdate(userId, { $inc: { score: points } });
  res.status(201).json(order);
});

router.get('/', authAdmin, async (req, res) => {
  const orders = await Order.find().populate('user').populate('products.product');
  res.json(orders);
});

router.get('/user/:userId', async (req, res) => {
  const orders = await Order.find({ user: req.params.userId }).populate('products.product');
  res.json(orders);
});

module.exports = router;