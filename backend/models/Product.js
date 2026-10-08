const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['Bread', 'Beverage', 'Pastries', 'Sandwich', 'Viennoiserie'], required: true },
  price: { type: Number, required: true },
  description: { type: String },
  image: { type: String }
});

module.exports = mongoose.model('Product', productSchema);