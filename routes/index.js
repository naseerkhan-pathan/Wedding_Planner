const express = require('express');
const Service = require('../models/Service');
const Review = require('../models/Review');
const Stats = require('../models/Stats');
const router = express.Router();

const DEFAULT_STATS = {
  totalBookings: 2000,
  customersVisited: 5000,
  successfulEvents: 1500,
  ongoingEvents: 300,
};

// Define a route for the homepage
router.get('/', async (req, res) => {
  try {
    const services = await Service.find().lean();
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(10).lean();
    const reviewCount = await Review.countDocuments();
    const averageRating = reviewCount > 0 ? Number((reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount).toFixed(1)) : 5;
    const reviewRatingStars = '★'.repeat(Math.round(averageRating)) + '☆'.repeat(5 - Math.round(averageRating));
    const stats = await Stats.findOne().lean() || DEFAULT_STATS;
    res.render('index0', {
      services,
      reviews,
      averageRating,
      reviewRatingStars,
      reviewCount,
      stats,
      userName: req.session?.userName,
      isAdmin: req.session?.isAdmin,
    });
  } catch (error) {
    console.error('Homepage render error:', error);
    res.render('index0', { services: [], reviews: [], averageRating: 5, reviewRatingStars: '★★★★★', reviewCount: 0, stats: DEFAULT_STATS, userName: req.session?.userName, isAdmin: req.session?.isAdmin });
  }
});

module.exports = router;
