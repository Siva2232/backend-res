const express = require('express');
const app = require('./server.js'); // This won't work easily because server.js starts the server

const listEndpoints = require('express-list-endpoints');

// We need to stop server.js from listening if we require it, or just parse it.
// Instead, let's create a small script that mimics the setup and prints routes.

const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const offerRoutes = require("./routes/offerRoutes");

const testApp = express();
testApp.use("/api/products", productRoutes);
testApp.use("/api/orders", orderRoutes);
testApp.use("/api/auth", authRoutes);
testApp.use("/api/banners", bannerRoutes);
testApp.use("/api/offers", offerRoutes);

function printRoutes(stack, prefix) {
    stack.forEach(layer => {
        if (layer.route) {
            Object.keys(layer.route.methods).forEach(method => {
                console.log(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
            });
        } else if (layer.name === 'router' && layer.handle.stack) {
            let p = prefix;
            // Trim regex assuming it's simple
            if (layer.regexp) {
                 const str = layer.regexp.toString();
                 // This is tricky for express regexes
            }
            // For now, let's just use the known prefixes
            // We can't easily reverse engineer the prefix from the regexp in this simple script 
            // without using a library or making assumptions.
        }
    });
}
// This is getting complicated.
console.log("Checking if route files import correctly...");
console.log("Banner Routes type:", typeof bannerRoutes);
console.log("Offer Routes type:", typeof offerRoutes);

if (typeof bannerRoutes !== 'function') {
    console.error("ERROR: bannerRoutes is not a router function");
}
if (typeof offerRoutes !== 'function') {
    console.error("ERROR: offerRoutes is not a router function");
}

console.log("Done.");
