const compression = require("compression");
const express = require("express");
const { jsonLimit, urlencodedLimit } = require("../config/httpLimits");

function applyBodyParsing(app) {
  app.use(compression());
  app.use(express.json({ limit: jsonLimit }));
  app.use(express.urlencoded({ limit: urlencodedLimit, extended: true }));
}

module.exports = { applyBodyParsing };
