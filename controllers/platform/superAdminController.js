const jwt = require("jsonwebtoken");
const SuperAdmin = require("../../models/SuperAdmin");

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

// @desc    Super Admin login
// @route   POST /api/superadmin/login
// @access  Public
const superAdminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "email and password required" });

    const admin = await SuperAdmin.findOne({ email: email.toLowerCase() });
    if (!admin || !(await admin.matchPassword(password)))
      return res.status(401).json({ message: "Invalid credentials" });

    if (!admin.isActive)
      return res.status(403).json({ message: "Account is deactivated" });

    res.json({
      _id:   admin._id,
      name:  admin.name,
      email: admin.email,
      role:  "superadmin",
      token: generateToken(admin._id, "superadmin"),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create / bootstrap first Super Admin
// @route   POST /api/superadmin/register
// @access  Public (only when no SA exists)
const superAdminRegister = async (req, res) => {
  try {
    const existing = await SuperAdmin.countDocuments();
    if (existing > 0)
      return res.status(403).json({ message: "Super Admin already exists. Contact system owner." });

    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "name, email and password are required" });

    const admin = await SuperAdmin.create({ name, email, password });
    res.status(201).json({
      _id:   admin._id,
      name:  admin.name,
      email: admin.email,
      role:  "superadmin",
      token: generateToken(admin._id, "superadmin"),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get Super Admin profile
// @route   GET /api/superadmin/me
// @access  Private/SuperAdmin
const getSuperAdminProfile = async (req, res) => {
  try {
    const admin = await SuperAdmin.findById(req.user._id).select("-password");
    if (!admin) return res.status(404).json({ message: "Not found" });
    res.json({ ...admin.toObject(), role: "superadmin" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update Super Admin profile
// @route   PUT /api/superadmin/profile
// @access  Private/SuperAdmin
const updateSuperAdminProfile = async (req, res) => {
  try {
    const admin = await SuperAdmin.findById(req.user._id);
    if (!admin) return res.status(404).json({ message: "Not found" });

    const { name, email } = req.body;
    if (name != null) admin.name = String(name).trim();
    if (email != null) {
      const nextEmail = String(email).trim().toLowerCase();
      if (!nextEmail) return res.status(400).json({ message: "Email is required" });
      const existing = await SuperAdmin.findOne({ email: nextEmail, _id: { $ne: admin._id } });
      if (existing) return res.status(400).json({ message: "Email already in use" });
      admin.email = nextEmail;
    }

    await admin.save();
    res.json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: "superadmin",
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Change Super Admin password
// @route   PUT /api/superadmin/profile/password
// @access  Private/SuperAdmin
const changeSuperAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const admin = await SuperAdmin.findById(req.user._id);
    if (!admin) return res.status(404).json({ message: "Not found" });

    const match = await admin.matchPassword(currentPassword);
    if (!match) return res.status(401).json({ message: "Current password is incorrect" });

    admin.password = newPassword;
    await admin.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  superAdminLogin,
  superAdminRegister,
  getSuperAdminProfile,
  updateSuperAdminProfile,
  changeSuperAdminPassword,
};
