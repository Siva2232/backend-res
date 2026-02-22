const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

(async () => {
  try {
    console.log('connecting');
    await mongoose.connect(process.env.MONGO_URI, { family: 4 });
    console.log('connected');
    const user = await User.findOne({ email: 'admin@example.com' }).lean();
    console.log('user:', user);
  } catch (e) {
    console.error('error', e);
  } finally {
    process.exit();
  }
})();
