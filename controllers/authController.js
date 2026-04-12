const jwt = require("jsonwebtoken");
const User = require("../models/User");

const generateToken = (id, restaurantId, role) => {
  return jwt.sign({ id, restaurantId: restaurantId || null, role: role || "admin" }, process.env.JWT_SECRET, {
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

    const role = user.role || (user.isAdmin ? "admin" : user.isKitchen ? "kitchen" : user.isWaiter ? "waiter" : "admin");

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      restaurantId: user.restaurantId || null,
      role,
      isAdmin: user.isAdmin || false,
      isKitchen: user.isKitchen || false,
      isWaiter: user.isWaiter || false,
      token: generateToken(user._id, user.restaurantId, role),
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


// @desc    Get all users (admin only)
// @route   GET /api/auth/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    if (!req.restaurantId) {
      return res.status(400).json({ message: "restaurantId is required" });
    }
    const users = await User.find({ restaurantId: req.restaurantId }).select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error("getUsers error", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Create a support team user (superadmin only)
// @route   POST /api/auth/support-team
// @access  Private/SuperAdmin
const createSupportUser = async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: "support",
      isAdmin: false,
      isKitchen: false,
      isWaiter: false,
      salary: 0,
      restaurantId: null,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("createSupportUser error", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get all support team users (superadmin only)
// @route   GET /api/auth/support-team
// @access  Private/SuperAdmin
const getSupportUsers = async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const supportUsers = await User.find({ role: "support" }).select("-password").sort({ createdAt: -1 });
    res.json(supportUsers);
  } catch (error) {
    console.error("getSupportUsers error", error);
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

    if (!req.restaurantId) {
      return res.status(400).json({ message: "restaurantId is required" });
    }
    const user = await User.findOne({ _id: id, restaurantId: req.restaurantId });
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
        // snapshot for salary/advance change, include note if provided
        const snapshot = { 
          amount: newSal, 
          advance: user.advance, 
          paid: 0, 
          note: req.body.note || "",
          date: new Date() 
        };
        user.salaryHistory.push(snapshot);
      }
      user.salary = newSal;
      if (typeof advance !== "undefined") user.advance = Number(advance);
    }
    if (password) user.password = password; // will be hashed by pre-save

    if (req.body.salaryHistory) {
      // completely replace history (this covers delete operations)
      // ensure any missing note fields are defaulted
      user.salaryHistory = (req.body.salaryHistory || []).map(h => ({
        amount: h.amount,
        advance: h.advance || 0,
        paid: h.paid || 0,
        note: h.note || "",
        date: h.date || new Date()
      }));
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
    if (!req.restaurantId) {
      return res.status(400).json({ message: "restaurantId is required" });
    }
    const user = await User.findOne({ _id: id, restaurantId: req.restaurantId });
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

// @desc    Get current session profile
// @route   GET /api/auth/profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Update current session profile
// @route   PUT /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { 
  authUser, 
  registerUser, 
  getUsers, 
  createSupportUser, 
  getSupportUsers, 
  updateUser, 
  deleteUser,
  getProfile,
  updateProfile
};

