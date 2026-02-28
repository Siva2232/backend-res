const jwt = require("jsonwebtoken");
const User = require("../models/User");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    // record login timestamp
    user.loginHistory = user.loginHistory || [];
    user.loginHistory.push(new Date());
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isKitchen: user.isKitchen || false,
      isWaiter: user.isWaiter || false,
      token: generateToken(user._id),
    });
  } else {
    res.status(401).json({ message: "Invalid email or password" });
  }
};

// @desc    Register a new user (Only for Admin creation in this context)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({});
    // if there are already users, lock registration to admins only
    if (existing && existing.isAdmin) {
      return res.status(403).json({ message: "Registration disabled" });
    }

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      isAdmin: true, // first user becomes admin
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// @desc    Create kitchen/waiter user (admin only)
// @route   POST /api/auth/staff
// @access  Private/Admin
const createStaff = async (req, res) => {
  try {
    // admin middleware should already verify but double-check
    if (!req.user || !(req.user.isAdmin === true || String(req.user.isAdmin).toLowerCase() === "true")) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { name, email, password, isKitchen = false, isWaiter = false, salary = 0, advance = 0 } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const userData = {
      name,
      email,
      password,
      isAdmin: false,
      isKitchen: isKitchen === true || String(isKitchen).toLowerCase() === "true",
      isWaiter: isWaiter === true || String(isWaiter).toLowerCase() === "true",
      salary: Number(salary) || 0,
      advance: Number(advance) || 0,
      salaryHistory: [],
    };
    if (salary && !isNaN(Number(salary))) {
      userData.salaryHistory.push({ amount: Number(salary), date: new Date() });
    }
    const user = await User.create(userData);

    if (user) {
      return res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isKitchen: user.isKitchen || false,
        isWaiter: user.isWaiter || false,
      });
    }

    res.status(500).json({ message: "Failed to create user" });
  } catch (error) {
    console.error("createStaff error", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get all users (admin only)
// @route   GET /api/auth/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error("getUsers error", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Update a user (admin only)
// @route   PUT /api/auth/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, isKitchen, isWaiter, salary, advance } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;
    if (typeof isKitchen !== "undefined") user.isKitchen = isKitchen;
    if (typeof isWaiter !== "undefined") user.isWaiter = isWaiter;
    if (typeof salary !== "undefined") {
      if (typeof advance !== "undefined") {
        user.advance = Number(advance);
      }
      const newSal = Number(salary);
      if (newSal !== user.salary || (typeof advance !== "undefined" && Number(advance) !== user.advance)) {
        user.salaryHistory = user.salaryHistory || [];
        // snapshot for salary/advance change
        const snapshot = { amount: newSal, advance: user.advance, paid: 0, date: new Date() };
        user.salaryHistory.push(snapshot);
      }
      user.salary = newSal;
      if (typeof advance !== "undefined") user.advance = Number(advance);
    }
    if (password) user.password = password; // will be hashed by pre-save

    if (req.body.salaryHistory) {
      // completely replace history (this covers delete operations)
      user.salaryHistory = req.body.salaryHistory;
    }

    const updated = await user.save();
    res.json({
      _id: updated._id,
      name: updated.name,
      email: updated.email,
      isAdmin: updated.isAdmin,
      isKitchen: updated.isKitchen,
      isWaiter: updated.isWaiter,
      salary: updated.salary,
      advance: updated.advance,
    });
  } catch (error) {
    console.error("updateUser error", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Delete a user (admin only)
// @route   DELETE /api/auth/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // prevent deleting self
    if (req.user && req.user._id.toString() === id) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    await user.remove();
    res.json({ message: "User removed" });
  } catch (error) {
    console.error("deleteUser error", error);
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = { authUser, registerUser, createStaff, getUsers, updateUser, deleteUser };
