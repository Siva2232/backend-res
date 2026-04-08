const OfferModel = require("../models/Offer");
const { getModel } = require("../utils/getModel");

const Offer = (req) => getModel("Offer", OfferModel.schema, req.restaurantId);

const getOffers = async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=120');
  const offers = await Offer(req).find({ isPublished: true }).select(
    "title description imageUrl tag"
  ).lean();
  res.json(offers);
};

const createOffer = async (req, res) => {
  const { title, description, imageUrl, tag, isPublished } = req.body;
  if (!title || !description || !imageUrl) {
    return res.status(400).json({ message: "Missing required fields: title, description, imageUrl" });
  }
  const offer = new (Offer(req))({ title, description, imageUrl, tag, isPublished });
  const createdOffer = await offer.save();
  res.status(201).json(createdOffer);
};

const updateOffer = async (req, res) => {
  const { title, description, imageUrl, tag, isPublished } = req.body;
  const offer = await Offer(req).findById(req.params.id);
  if (offer) {
    offer.title = title || offer.title;
    offer.description = description || offer.description;
    offer.imageUrl = imageUrl || offer.imageUrl;
    offer.tag = tag || offer.tag;
    offer.isPublished = isPublished !== undefined ? isPublished : offer.isPublished;
    const updatedOffer = await offer.save();
    res.json(updatedOffer);
  } else {
    res.status(404).json({ message: "Offer not found" });
  }
};

const deleteOffer = async (req, res) => {
  const offer = await Offer(req).findById(req.params.id);
  if (offer) {
    await offer.deleteOne();
    res.json({ message: "Offer removed" });
  } else {
    res.status(404).json({ message: "Offer not found" });
  }
};

module.exports = { getOffers, createOffer, updateOffer, deleteOffer };
