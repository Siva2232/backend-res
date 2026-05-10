const path = require("path");

/** Repo root (`backend-res/`), regardless of caller location under `src/`. */
const ROOT_DIR = path.join(__dirname, "..", "..");

module.exports = { ROOT_DIR };
