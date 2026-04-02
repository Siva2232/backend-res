/**
 * One-time script to restore / upsert the admin account.
 * Run once:  node restore-admin.js
 * The password is hashed by the User pre-save hook automatically.
 */
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./config/db');
const User = require('./models/User');

const ADMIN_EMAIL    = 'admin@example.com';
const ADMIN_PASSWORD = 'password123';
const ADMIN_NAME     = 'Admin';

(async () => {
  await connectDB();

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    // Re-set the password as plain text — pre-save hook will hash it correctly
    existing.password = ADMIN_PASSWORD;
    existing.isAdmin  = true;
    existing.name     = existing.name || ADMIN_NAME;
    await existing.save();
    console.log('✅  Admin password reset for', ADMIN_EMAIL);
  } else {
    await User.create({
      name:     ADMIN_NAME,
      email:    ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      isAdmin:  true,
    });
    console.log('✅  Admin account created:', ADMIN_EMAIL);
  }

  process.exit(0);
})();
