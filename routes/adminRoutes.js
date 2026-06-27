const express = require('express');
const Service = require('../models/Service');
const Review = require('../models/Review');
const Stats = require('../models/Stats');
const Booking = require('../models/Booking');
const Register = require('../models/Register');
const router = express.Router();

const BOOKING_ADVANCE_AMOUNT = 5000;
const BOOKING_STATUSES = ['pending', 'accepted', 'rejected', 'process started', 'completed', 'cancelled'];
const ACTIVE_BOOKING_STATUSES = ['pending', 'accepted', 'process started', 'ongoing'];
const DEFAULT_STATS = {
  totalBookings: 2000,
  customersVisited: 5000,
  successfulEvents: 1500,
  ongoingEvents: 300,

  advanceTotal: 100000,
  eventTotal: 375000,
  totalEarnings: 475000,

  eventAmount: 0,
  eventAmountPerCompletedEvent: 0,
};
const DASHBOARD_FILTERS = {
  all: { label: 'All', days: null },
  week: { label: '7 Days', days: 7 },
  month: { label: '30 Days', days: 30 },
  year: { label: '1 Year', days: 365 },
};
const REMOVED_BOOKING_STATUSES = ['rejected', 'cancelled'];

function getBookingDate(booking) {
  return booking.createdAt || booking.updatedAt || new Date();
}

function isInDateRange(date, dateFrom) {
  if (!dateFrom) return true;
  return new Date(date) >= dateFrom;
}

function getDateFromFilter(filterKey) {
  const filter = DASHBOARD_FILTERS[filterKey] || DASHBOARD_FILTERS.all;
  if (!filter.days) return null;

  const date = new Date();
  date.setDate(date.getDate() - filter.days);
  return date;
}

function addInc(inc, field, value) {
  if (!value) return;
  inc[field] = (inc[field] || 0) + value;
}

async function incrementStats(inc) {
  if (!Object.keys(inc).length) return;

  await Stats.findOneAndUpdate(
    {},
    {
      $inc: inc,
      $set: { updatedAt: new Date() },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

function getStatusStatsInc(oldStatus, newStatus) {
  const inc = {};
  const oldCounted = !REMOVED_BOOKING_STATUSES.includes(oldStatus);
  const newCounted = !REMOVED_BOOKING_STATUSES.includes(newStatus);
  const oldOngoing = ACTIVE_BOOKING_STATUSES.includes(oldStatus);
  const newOngoing = ACTIVE_BOOKING_STATUSES.includes(newStatus);
  const oldCompleted = oldStatus === 'completed';
  const newCompleted = newStatus === 'completed';

  if (!oldCounted && newCounted) {
    addInc(inc, 'totalBookings', 1);
    addInc(inc, 'advanceTotal', BOOKING_ADVANCE_AMOUNT);
    addInc(inc, 'totalEarnings', BOOKING_ADVANCE_AMOUNT);
  } else if (oldCounted && !newCounted) {
    addInc(inc, 'totalBookings', -1);
    addInc(inc, 'advanceTotal', -BOOKING_ADVANCE_AMOUNT);
    addInc(inc, 'totalEarnings', -BOOKING_ADVANCE_AMOUNT);
  }

  if (!oldOngoing && newOngoing) addInc(inc, 'ongoingEvents', 1);
  if (oldOngoing && !newOngoing) addInc(inc, 'ongoingEvents', -1);
  if (!oldCompleted && newCompleted) {
    addInc(inc, 'successfulEvents', 1);
  }
  if (oldCompleted && !newCompleted) {
    addInc(inc, 'successfulEvents', -1);
  }

  return inc;
}

function getAdvanceAmount(booking) {
  return Number(booking.Advance_Amount || booking.advanceAmount || BOOKING_ADVANCE_AMOUNT);
}

function getRemainingAmount(booking) {
  if (booking.Remaining_Amount !== undefined && booking.Remaining_Amount !== null) {
    return Number(booking.Remaining_Amount) || 0;
  }
  if (booking.remainingAmount !== undefined && booking.remainingAmount !== null) {
    return Number(booking.remainingAmount) || 0;
  }

  const legacyTotal = Number(booking.Final_Amount || booking.finalAmount || 0);
  return Math.max(legacyTotal - getAdvanceAmount(booking), 0);
}

function isAmountSaved(booking) {
  return Boolean(booking.amountUpdatedAt);
}

function getProgressMetrics(stats, serviceBookings, weddingBookings, dateFrom) {
  if (!dateFrom) {
    return [
      { label: 'Customers Visited', value: stats.customersVisited || 0 },
      { label: 'Bookings', value: stats.totalBookings || 0 },
      { label: 'Completed', value: stats.successfulEvents || 0 },
      { label: 'Ongoing', value: stats.ongoingEvents || 0 },
    ];
  }

  const bookingsInRange = [...serviceBookings, ...weddingBookings].filter((booking) => isInDateRange(getBookingDate(booking), dateFrom));
  const completedInRange = [...serviceBookings, ...weddingBookings].filter((booking) => (
    booking.status === 'completed' && isInDateRange(booking.completedAt || booking.updatedAt || booking.createdAt, dateFrom)
  ));
  const activeInRange = bookingsInRange.filter((booking) => ACTIVE_BOOKING_STATUSES.includes(booking.status));
  const customers = new Set(bookingsInRange.map((booking) => booking.UserName || booking.userName).filter(Boolean));

  return [
    { label: 'Customers', value: customers.size },
    { label: 'Bookings', value: bookingsInRange.length },
    { label: 'Completed', value: completedInRange.length },
    { label: 'Ongoing', value: activeInRange.length },
  ];
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/login');
}

router.get('/', requireAdmin, async (req, res) => {
  try {
    const progressFilter = DASHBOARD_FILTERS[req.query.progressRange] ? req.query.progressRange : 'all';
    const revenueFilter = DASHBOARD_FILTERS[req.query.revenueRange] ? req.query.revenueRange : 'all';
    const progressDateFrom = getDateFromFilter(progressFilter);
    const revenueDateFrom = getDateFromFilter(revenueFilter);
    const serviceCount = await Service.countDocuments();
    const reviewCount = await Review.countDocuments();
    const serviceBookingCount = await Booking.countDocuments();
    const weddingBookingCount = await Register.countDocuments();
    const bookingCount = serviceBookingCount + weddingBookingCount;
    const completedServiceCount = await Booking.countDocuments({ status: 'completed' });
    const completedWeddingCount = await Register.countDocuments({ status: 'completed' });
    const completedCount = completedServiceCount + completedWeddingCount;
    const serviceBookings = await Booking.find().lean();
    const weddingBookings = await Register.find().lean();
    const stats = await Stats.findOne().lean() || DEFAULT_STATS;
    const revenueBookings = [...serviceBookings, ...weddingBookings];

    const advanceBookingCount = revenueBookings.filter(
      (booking) => (
        !REMOVED_BOOKING_STATUSES.includes(booking.status || 'pending') &&
        isInDateRange(getBookingDate(booking), revenueDateFrom)
      )
    ).length;

    const savedCompletedBookings = revenueBookings.filter((booking) => (
      booking.status === 'completed' &&
      isAmountSaved(booking) &&
      isInDateRange(booking.amountUpdatedAt || booking.completedAt || booking.updatedAt || booking.createdAt, revenueDateFrom)
    ));
    const advanceRevenue = stats.advanceTotal || 100000;
const eventRevenue = stats.eventTotal || 375000;
const totalRevenue = stats.totalEarnings || 475000;
const chartData = {
  metrics: getProgressMetrics(
    stats,
    serviceBookings,
    weddingBookings,
    progressDateFrom
  ),

  progress: {
    filter: progressFilter
  },

  revenue: {
  advanceTotal: advanceRevenue,
  eventTotal: eventRevenue,
  total: totalRevenue
  },

  filters: DASHBOARD_FILTERS
};
const statsDoc = await Stats.findOne();

if (!statsDoc) {
  await Stats.create({
    totalBookings: 2000,
    customersVisited: 5000,
    successfulEvents: 1500,
    ongoingEvents: 300,

    advanceTotal: 100000,
    eventTotal: 375000,
    totalEarnings: 475000
  });
}

    res.render('admin', { serviceCount, reviewCount, bookingCount, completedCount, stats, chartData });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.redirect('/login');
  }
});

router.get('/services', requireAdmin, async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 }).lean();
    res.render('admin_services', { services });
  } catch (error) {
    console.error('Admin services error:', error);
    res.redirect('/admin');
  }
});

router.post('/services/add', requireAdmin, async (req, res) => {
  try {
    const { title, description, iconClass, price } = req.body;
    await Service.create({ title, description, iconClass, price });
    res.redirect('/admin/services');
  } catch (error) {
    console.error('Add service error:', error);
    res.redirect('/admin/services');
  }
});

router.post('/services/edit/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { title, description, iconClass, price } = req.body;
    await Service.findByIdAndUpdate(id, { title, description, iconClass, price });
    res.redirect('/admin/services');
  } catch (error) {
    console.error('Edit service error:', error);
    res.redirect('/admin/services');
  }
});

router.post('/services/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.redirect('/admin/services');
  } catch (error) {
    console.error('Delete service error:', error);
    res.redirect('/admin/services');
  }
});

router.get('/reviews', requireAdmin, async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }).lean();
    res.render('admin_reviews', { reviews });
  } catch (error) {
    console.error('Admin reviews error:', error);
    res.redirect('/admin');
  }
});

router.post('/reviews/edit/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, text, rating } = req.body;
    const safeRating = Math.min(Math.max(Number(rating) || 5, 1), 5);
    await Review.findByIdAndUpdate(id, { name, text, rating: safeRating });
    res.redirect('/admin/reviews');
  } catch (error) {
    console.error('Edit review error:', error);
    res.redirect('/admin/reviews');
  }
});

router.post('/reviews/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.redirect('/admin/reviews');
  } catch (error) {
    console.error('Delete review error:', error);
    res.redirect('/admin/reviews');
  }
});

/* ---------------- Bookings Management ---------------- */

router.get('/bookings', requireAdmin, async (req, res) => {
  try {
    const serviceBookings = await Booking.find().sort({ createdAt: -1 }).lean();
    const weddingBookings = await Register.find().sort({ createdAt: -1 }).lean();
    const bookings = [
      ...weddingBookings.map((booking) => ({ ...booking, bookingType: 'wedding' })),
      ...serviceBookings.map((booking) => ({ ...booking, bookingType: 'service' })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render('admin_bookings', { bookings });
  } catch (error) {
    console.error('Admin bookings error:', error);
    res.redirect('/admin');
  }
});

router.post('/bookings/update-status/:type/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!BOOKING_STATUSES.includes(status)) {
      return res.redirect('/admin/bookings');
    }

    const Model = req.params.type === 'wedding' ? Register : Booking;
    const booking = await Model.findById(req.params.id);
    
    if (!booking) {
      return res.redirect('/admin/bookings');
    }

    const oldStatus = booking.status || 'pending';
    if (oldStatus === 'completed') {
      return res.redirect('/admin/bookings');
    }

    booking.status = status;
    if (status === 'completed' && !booking.completedAt) {
      booking.completedAt = new Date();
    } else if (oldStatus === 'completed' && status !== 'completed') {
      booking.completedAt = undefined;
    }
    await booking.save();

    if (oldStatus !== status) {
      await incrementStats(getStatusStatsInc(oldStatus, status));
    }

    res.redirect('/admin/bookings');
  } catch (error) {
    console.error('Update booking status error:', error);
    res.redirect('/admin/bookings');
  }
});

router.post('/bookings/update-amount/:type/:id', requireAdmin, async (req, res) => {
  try {
    const Model = req.params.type === 'wedding' ? Register : Booking;
    const booking = await Model.findById(req.params.id);
    if (!booking || booking.status !== 'completed' || booking.amountUpdatedAt) {
      return res.redirect('/admin/bookings');
    }

    const remainingAmount = Math.max(Number(req.body.remainingAmount) || 0, 0);
    const advanceAmount = BOOKING_ADVANCE_AMOUNT;
    const totalAmount = advanceAmount + remainingAmount;
    if (req.params.type === 'wedding') {
      booking.Remaining_Amount = remainingAmount;
      booking.Final_Amount = totalAmount;
      booking.Advance_Amount = advanceAmount;
      booking.Payment_Status = booking.Payment_Status || 'paid';
    } else {
      booking.remainingAmount = remainingAmount;
      booking.finalAmount = totalAmount;
      booking.advanceAmount = advanceAmount;
      booking.advancePaymentStatus = 'paid';
    }
    booking.amountUpdatedAt = new Date();
    await booking.save();
    await incrementStats({
  eventTotal: remainingAmount,
  totalEarnings: remainingAmount,
});

    res.redirect('/admin/bookings');
  } catch (error) {
    console.error('Update booking amount error:', error);
    res.redirect('/admin/bookings');
  }
});

router.post('/bookings/delete/:type/:id', requireAdmin, async (req, res) => {
  try {
    const Model = req.params.type === 'wedding' ? Register : Booking;
    const booking = await Model.findById(req.params.id);
    if (!booking || !['rejected', 'cancelled'].includes(booking.status || 'pending')) {
      return res.redirect('/admin/bookings');
    }

    if (booking) {
      await incrementStats(getStatusStatsInc(booking.status || 'pending', 'cancelled'));
    }
    
    await Model.findByIdAndDelete(req.params.id);
    res.redirect('/admin/bookings');
  } catch (error) {
    console.error('Delete booking error:', error);
    res.redirect('/admin/bookings');
  }
});

/* ---------------- Stats Management ---------------- */

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await Stats.findOne().lean() || DEFAULT_STATS;
    res.render('admin_stats', { stats });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.redirect('/admin');
  }
});

router.post('/stats/update', requireAdmin, async (req, res) => {
  try {
    const { totalBookings, customersVisited, successfulEvents, ongoingEvents } = req.body;
    
    await Stats.findOneAndUpdate(
      {},
      {
        totalBookings: Number(totalBookings) || 2000,
        customersVisited: Number(customersVisited) || 5000,
        successfulEvents: Number(successfulEvents) || 1500,
        ongoingEvents: Number(ongoingEvents) || 300,
      },
      { upsert: true, new: true }
    );

    res.redirect('/admin/stats');
  } catch (error) {
    console.error('Update stats error:', error);
    res.redirect('/admin/stats');
  }
});

module.exports = router;

