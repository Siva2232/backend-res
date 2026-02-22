const express = require("express");
const bannerRoutes = require("./routes/bannerRoutes");
const offerRoutes = require("./routes/offerRoutes");

console.log("Checking Banner Routes...");
console.log("Type:", typeof bannerRoutes);
if (bannerRoutes && bannerRoutes.stack) {
    console.log("Banner Routes Stack Length:", bannerRoutes.stack.length);
    bannerRoutes.stack.forEach((layer, i) => {
        if (layer.route) {
            console.log(`Layer ${i}: Route ${layer.route.path} Methods: ${Object.keys(layer.route.methods)}`);
        }
    });
} else {
    console.log("Banner Routes seems to be empty or not a router.");
}

console.log("Checking Offer Routes...");
console.log("Type:", typeof offerRoutes);
if (offerRoutes && offerRoutes.stack) {
    console.log("Offer Routes Stack Length:", offerRoutes.stack.length);
    offerRoutes.stack.forEach((layer, i) => {
        if (layer.route) {
            console.log(`Layer ${i}: Route ${layer.route.path} Methods: ${Object.keys(layer.route.methods)}`);
        }
    });
} else {
    console.log("Offer Routes seems to be empty or not a router.");
}
