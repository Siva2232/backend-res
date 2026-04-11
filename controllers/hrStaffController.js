const HRStaffModel = require('../models/HRStaff');
const { getModel } = require('../utils/getModel');

const HRStaff = async (req) => getModel('HRStaff', HRStaffModel.schema, req.restaurantId);
const User = require('../models/User'); // Import User model
const jwt = require('jsonwebtoken');
const { emitUpdate } = require('../utils/socketUtils');

const generateToken = (id, restaurantId) =>
  jwt.sign({ id, type: 'hr', restaurantId }, process.env.JWT_SECRET, { expiresIn: '30d' });

// ─── Auth ─────────────────────────────────────────────────────────────────────

// @desc  HR Staff login
// @route POST /api/hr/staff/login
const loginStaff = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const staff = await (await HRStaff(req)).findOne({ email }).populate('currentShift', 'name type startTime endTime');
    if (!staff || !(await staff.matchPassword(password)))
      return res.status(401).json({ message: 'Invalid email or password' });

    if (staff.status !== 'active')
      return res.status(403).json({ message: 'Account is inactive. Contact admin.' });

    res.json({
      _id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      department: staff.department,
      designation: staff.designation,
      avatar: staff.avatar,
      restaurantId: req.restaurantId,
      token: generateToken(staff._id, req.restaurantId),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

// @desc  Get all staff (with search, filter, pagination)
// @route GET /api/hr/staff
const getAllStaff = async (req, res) => {
  try {
    const { search, department, role, status, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }
    if (department) query.department = { $regex: department, $options: 'i' };
    if (role) query.role = role;
    if (status) query.status = status;

    const total = await (await HRStaff(req)).countDocuments(query);
    const staff = await (await HRStaff(req)).find(query)
      .select('-password')
      .populate('currentShift', 'name type startTime endTime')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ staff, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get single staff profile
// @route GET /api/hr/staff/:id
const getStaffById = async (req, res) => {
  try {
    const staff = await (await HRStaff(req)).findById(req.params.id)
      .select('-password')
      .populate('currentShift', 'name type startTime endTime');
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Create staff
// @route POST /api/hr/staff
const createStaff = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      phone, 
      role, 
      department, 
      designation,
      joiningDate, 
      status, 
      baseSalary, 
      address, 
      gender, 
      dateOfBirth, 
      emergencyContact 
    } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });

    const exists = await (await HRStaff(req)).findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    // Sync with User model for global panel access (Admin/Manager/Waiter/Kitchen)
    const normalizedRole = role ? role.toLowerCase() : 'staff';
    const normalizedDept = department ? department.toLowerCase() : '';

    const isAdmin = normalizedRole === 'admin' || normalizedRole === 'manager';
    const isKitchen = normalizedDept.includes('kitchen');
    const isWaiter = normalizedDept.includes('waiter');

    // Create or update main User account for any role that needs panel access
    const userExists = await User.findOne({ email, restaurantId: req.restaurantId });
    if (!userExists) {
      await User.create({
        name,
        email,
        password,
        isAdmin,
        isKitchen,
        isWaiter,
        salary: baseSalary || 0,
        restaurantId: req.restaurantId,
      });
    } else {
      // If user exists, update their flags to match the new HR role
      userExists.isAdmin = isAdmin;
      userExists.isKitchen = isKitchen;
      userExists.isWaiter = isWaiter;
      if (password) userExists.password = password;
      await userExists.save();
    }

    const staff = await (await HRStaff(req)).create({
      name, email, password, phone, role, department, designation,
      joiningDate, status, baseSalary, address, gender, dateOfBirth, emergencyContact,
    });

    const result = staff.toObject();
    delete result.password;
    emitUpdate(req, 'staffUpdate', result);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Update staff
// @route PUT /api/hr/staff/:id
const updateStaff = async (req, res) => {
  try {
    const { password, ...updates } = req.body;
    const staff = await (await HRStaff(req)).findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    // Update staff record
    Object.assign(staff, updates);
    if (password) staff.password = password;
    await staff.save();

    // Check if we need to sync with User model
    const normalizedRole = staff.role ? staff.role.toLowerCase() : 'staff';
    const normalizedDept = staff.department ? staff.department.toLowerCase() : '';

    const isAdmin = normalizedRole === 'admin' || normalizedRole === 'manager';
    const isKitchen = normalizedDept.includes('kitchen');
    const isWaiter = normalizedDept.includes('waiter');

    const user = await User.findOne({ email: staff.email, restaurantId: req.restaurantId });
    if (user) {
      user.name = staff.name;
      user.email = staff.email;
      if (password) user.password = password;
      user.isAdmin = isAdmin;
      user.isKitchen = isKitchen;
      user.isWaiter = isWaiter;
      user.salary = staff.baseSalary || 0;
      await user.save();
    } else if ((isAdmin || isKitchen || isWaiter) && password) {
      // Only create User record if a plain-text password was provided in this request.
      // Never use staff.password here — it is already hashed by HRStaff pre-save and
      // passing it to User.create would cause double-hashing.
      await User.create({
        name: staff.name,
        email: staff.email,
        password, // plain text from req.body — User pre-save hook will hash it
        isAdmin,
        isKitchen,
        isWaiter,
        salary: staff.baseSalary || 0,
        restaurantId: req.restaurantId,
      });
    }

    const result = staff.toObject();
    delete result.password;
    emitUpdate(req, 'staffUpdate', result);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc  Delete staff
// @route DELETE /api/hr/staff/:id
const deleteStaff = async (req, res) => {
  try {
    const staff = await (await HRStaff(req)).findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    // Also remove the linked User account to keep both systems in sync
    await User.findOneAndDelete({ email: staff.email, restaurantId: req.restaurantId });

    await staff.deleteOne();
    emitUpdate(req, 'staffDelete', req.params.id);
    res.json({ message: 'Staff deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Upload document for a staff member (base64 stored, or URL from Cloudinary)
// @route POST /api/hr/staff/:id/documents
const uploadDocument = async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url)
      return res.status(400).json({ message: 'Document name and URL required' });

    const staff = await (await HRStaff(req)).findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    staff.documents.push({ name, url });
    await staff.save();
    res.json(staff.documents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Delete a document
// @route DELETE /api/hr/staff/:id/documents/:docId
const deleteDocument = async (req, res) => {
  try {
    const staff = await (await HRStaff(req)).findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    staff.documents = staff.documents.filter(
      (d) => String(d._id) !== req.params.docId
    );
    await staff.save();
    res.json({ message: 'Document removed', documents: staff.documents });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get logged-in staff profile (staff portal)
// @route GET /api/hr/staff/me
const getMyProfile = async (req, res) => {
  try {
    const staff = await (await HRStaff(req)).findById(req.hrStaff._id)
      .select('-password')
      .populate('currentShift', 'name type startTime endTime');
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Change password (staff portal)
// @route PUT /api/hr/staff/me/password
const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const staff = await (await HRStaff(req)).findById(req.hrStaff._id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    const match = await staff.matchPassword(currentPassword);
    if (!match) return res.status(401).json({ message: 'Current password incorrect' });

    staff.password = newPassword;
    await staff.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  loginStaff, getAllStaff, getStaffById, createStaff, updateStaff,
  deleteStaff, uploadDocument, deleteDocument, getMyProfile, changeMyPassword,
};
