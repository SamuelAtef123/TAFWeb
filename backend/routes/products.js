const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Product = require('../models/Product');
const { authAdmin } = require('../middleware/auth');

const ALLOWED_FIELDS = ['name', 'category', 'price', 'description', 'image'];
const pickAllowed = body => {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

const validateId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  next();
};

router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(503).json({ message: 'Product service is unavailable' });
  }
});

router.post('/', authAdmin, async (req, res) => {
  const product = await Product.create(pickAllowed(req.body));
  res.status(201).json(product);
});

router.put('/:id', authAdmin, validateId, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, pickAllowed(req.body), {
    new: true,
    runValidators: true
  });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

router.delete('/:id', authAdmin, validateId, async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json({ message: 'Product deleted' });
});

module.exports = router;
