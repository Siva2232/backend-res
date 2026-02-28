const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, required: true, default: true },
    isKitchen: { type: Boolean, required: true, default: false },
    isWaiter: { type: Boolean, required: true, default: false },
    salary: { type: Number, required: true, default: 0 },
    advance: { type: Number, required: true, default: 0 },
    salaryHistory: [
      {
        amount: { type: Number, required: true },
        advance: { type: Number, default: 0 },
        paid: { type: Number, default: 0 },
        date: { type: Date, required: true, default: Date.now }
      }
    ],
    loginHistory: [ { type: Date } ],
  },
  { timestamps: true }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Password hashing hook (async style - no next parameter)
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model("User", userSchema);
