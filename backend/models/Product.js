const mongoose = require('mongoose');

// The real menu categories (same ones the website filters by)
const CATEGORIES = [
  'Viennoiserie',
  'Cookies',
  'Muffins',
  'English Cake',
  'Individuals',
  'Bread',
  'Salad',
  'Sandwiches',
  'Tarts',
  'Choux',
  'Hot Drinks',
  'V60 Coffee',
  'Cold Drinks',
  'Smoothies',
  'Beverages',
  'Extras',
  'New Drinks'
];

const productSchema = new mongoose.Schema({
  // Short menu code such as COL001 or VIE006. Unique, and used for the image file name.
  code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: CATEGORIES, required: true },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'EGP' },
  description: { type: String },
  image: { type: String },
  featured: { type: Boolean, default: false },
  available: { type: Boolean, default: true }
});

const Product = mongoose.model('Product', productSchema);
Product.CATEGORIES = CATEGORIES;

module.exports = Product;
