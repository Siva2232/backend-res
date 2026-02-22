const Banner = require("../models/Banner");

const getBanners = async (req, res) => {
  const banners = await Banner.find({});
  res.json(banners);
};

const createBanner = async (req, res) => {
  const { title, description, imageUrl, tag } = req.body;
  
  if (!title || !description || !imageUrl) {
    return res.status(400).json({ message: "Missing required fields: title, description, and imageUrl are strictly required." });
  }

  const banner = new Banner({ title, description, imageUrl, tag });
  const createdBanner = await banner.save();
  res.status(201).json(createdBanner);
};

const updateBanner = async (req, res) => {
  const { title, description, imageUrl, tag } = req.body;
  const banner = await Banner.findById(req.params.id);
  if (banner) {
    banner.title = title || banner.title;
    banner.description = description || banner.description;
    banner.imageUrl = imageUrl || banner.imageUrl;
    banner.tag = tag || banner.tag;
    const updatedBanner = await banner.save();
    res.json(updatedBanner);
  } else {
    res.status(404).json({ message: "Banner not found" });
  }
};

const deleteBanner = async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (banner) {
    await banner.deleteOne();
    res.json({ message: "Banner removed" });
  } else {
    res.status(404).json({ message: "Banner not found" });
  }
};

module.exports = { getBanners, createBanner, updateBanner, deleteBanner };
