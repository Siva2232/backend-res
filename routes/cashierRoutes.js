const express = require("express");
const { CASHIERS } = require("../constants/cashierConstants");
const router = express.Router();

/**
 * GET /api/cashiers
 * Get list of all available cashiers
 */
router.get("/", (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: CASHIERS,
      message: "Cashiers fetched successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching cashiers",
      error: err.message,
    });
  }
});

module.exports = router;
