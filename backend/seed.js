// Loads the bakery menu (backend/data/menu.json) into MongoDB.
//
//   npm run seed            add / update every menu item (safe to run again - matches on `code`)
//   npm run seed -- --prune also delete products that are NOT on the menu (e.g. old test data)
//
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Product = require('./models/Product');
const menu = require('./data/menu.json');

dotenv.config();

const prune = process.argv.includes('--prune');

const run = async () => {
  if (!process.env.MONGO_URI || process.env.MONGO_URI === 'your_mongodb_connection_string') {
    throw new Error('MONGO_URI is missing. Set it in backend/.env.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  await Product.init(); // make sure the unique index on `code` exists
  console.log(`Connected to "${mongoose.connection.name}"`);

  let created = 0;
  let updated = 0;

  for (const item of menu) {
    const result = await Product.updateOne(
      { code: item.code },
      { $set: item },
      { upsert: true, runValidators: true }
    );
    if (result.upsertedCount) created += 1;
    else updated += 1;
  }

  let removed = 0;
  if (prune) {
    const codes = menu.map(item => item.code);
    const res = await Product.deleteMany({ $or: [{ code: { $nin: codes } }, { code: { $exists: false } }] });
    removed = res.deletedCount;
  }

  const total = await Product.countDocuments();
  console.log(`Menu seeded: ${created} created, ${updated} updated${prune ? `, ${removed} removed` : ''}.`);
  console.log(`Products in database: ${total}`);
};

run()
  .catch(error => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
