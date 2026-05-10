const express = require("express");
const path = require("path");
const { ROOT_DIR } = require("../config/paths");

function applyStaticAndRoot(app) {
  app.use("/uploads", express.static(path.join(ROOT_DIR, "uploads")));

  app.get("/", (req, res) => {
    res.send("API is running...");
  });
}

module.exports = { applyStaticAndRoot };
