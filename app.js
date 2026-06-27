require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const User = require('./models/User');
const Register = require('./models/Register');
const Service = require('./models/Service');
const Review = require('./models/Review');
const Stats = require('./models/Stats');
const Booking = require('./models/Booking');
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Naseerkhan';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Naseer123@';
const BOOKING_ADVANCE_AMOUNT = 5000;
const ACTIVE_BOOKING_STATUSES = ['pending', 'accepted', 'process started'];
const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userName) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/login');
}

async function incrementStats(inc) {
  await Stats.findOneAndUpdate(
    {},
    {
      $inc: inc,
      $set: { updatedAt: new Date() },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function removeBookingFromStats(status) {
  if (status === 'completed') {
    await incrementStats({
      totalBookings: -1,
      successfulEvents: -1,
      totalEarnings: -BOOKING_ADVANCE_AMOUNT,
      advanceTotal: -BOOKING_ADVANCE_AMOUNT,
    });
    return;
  }

  if (ACTIVE_BOOKING_STATUSES.includes(status || 'pending')) {
    await incrementStats({
      totalBookings: -1,
      ongoingEvents: -1,
      totalEarnings: -BOOKING_ADVANCE_AMOUNT,
      advanceTotal: -BOOKING_ADVANCE_AMOUNT,
    });
  }
}

/* ---------------- Middleware ---------------- */

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

/* ---------------- MongoDB Connection ---------------- */

mongoose.connect(process.env.MONGO_URL)
  .then(async () => {
    console.log('Connected to MongoDB');
    const defaultServices = [
      { title: 'Invitation', description: 'Custom wedding invitation cards and e-invites.', iconClass: 'fas fa-book-open' },
      { title: 'Photography', description: 'Wedding photography and video coverage.', iconClass: 'fas fa-camera' },
      { title: 'Makeup', description: 'Bridal beauty and makeup services.', iconClass: 'fas fa-brush' },
      { title: 'Flowers', description: 'Flower decoration and stage design.', iconClass: 'fab fa-pagelines' },
      { title: 'Cake', description: 'Customized wedding cakes and desserts.', iconClass: 'fas fa-birthday-cake' },
      { title: 'Music', description: 'DJ, live band and entertainment services.', iconClass: 'fas fa-music' },
      { title: 'Catering', description: 'Premium catering and menu customization.', iconClass: 'fas fa-utensils' },
      { title: 'Jewellery', description: 'Wedding jewellery and accessory planning.', iconClass: 'fas fa-ring' },
    ];
    const serviceCount = await Service.countDocuments();
    if (serviceCount === 0) {
      await Service.insertMany(defaultServices);
      console.log('Default services seeded');
    }
    const reviewCount = await Review.countDocuments();
    if (reviewCount === 0) {
      await Review.insertMany([
        { name: 'Priya S.', text: 'Excellent support from booking to event execution.', rating: 5 },
        { name: 'Anuj K.', text: 'Beautiful venue setup and seamless coordination.', rating: 5 },
      ]);
      console.log('Default reviews seeded');
    }
    const statsCount = await Stats.countDocuments();
    if (statsCount === 0) {
      await Stats.create({
        totalBookings: 2000,
        customersVisited: 5000,
        successfulEvents: 1500,
        ongoingEvents: 300,
      });
      console.log('Default stats seeded');
    }
  })
  .catch(err => console.log('MongoDB Error:', err));

/* ---------------- View Engine ---------------- */

app.set('views', path.join(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');

/* ---------------- Session ---------------- */

app.use(
  session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

/* ---------------- Routes ---------------- */

app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/', indexRoutes);

app.get('/signup', (req, res) => res.render('signup', { errorMessage: null }));
app.get('/register', requireLogin, (req, res) => res.render('register', {
  errorMessage: null,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  advanceAmount: BOOKING_ADVANCE_AMOUNT,
}));
function normalizeServiceIcons(services) {
  return services.map(service => {
    if (!service.iconClass) {
      service.iconClass = 'fas fa-concierge-bell';
    }
    if (service.title && service.title.toLowerCase() === 'flowers') {
      service.iconClass = 'fab fa-pagelines';
    }
    if (service.iconClass.includes('fa-pagelines') && !service.iconClass.includes('fab')) {
      service.iconClass = service.iconClass.replace('fas', 'fab');
    }
    return service;
  });
}

app.get('/index', requireLogin, async (req, res) => {
  try {
    let services = await Service.find().lean();
    services = normalizeServiceIcons(services);
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(10).lean();
    const reviewCount = await Review.countDocuments();
    const averageRating = reviewCount > 0 ? Number((reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount).toFixed(1)) : 5;
    const reviewRatingStars = '★'.repeat(Math.round(averageRating)) + '☆'.repeat(5 - Math.round(averageRating));
    const stats = await Stats.findOne().lean() || { totalBookings: 2000, customersVisited: 5000, successfulEvents: 1500, ongoingEvents: 300 };
    res.render('index', {
      services,
      reviews,
      averageRating,
      reviewRatingStars,
      reviewCount,
      stats,
      userName: req.session.userName,
      isAdmin: req.session.isAdmin,
    });
  } catch (error) {
    console.error('Index render error:', error);
    res.render('index', { services: [], reviews: [], averageRating: 5, reviewRatingStars: '★★★★★', reviewCount: 0, stats: { totalBookings: 2000, customersVisited: 5000, successfulEvents: 1500, ongoingEvents: 300 }, userName: req.session.userName, isAdmin: req.session.isAdmin });
  }
});
app.get('/index0', async (req, res) => {
  try {
    let services = await Service.find().lean();
    services = normalizeServiceIcons(services);
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(10).lean();
    const reviewCount = await Review.countDocuments();
    const averageRating = reviewCount > 0 ? Number((reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount).toFixed(1)) : 5;
    const reviewRatingStars = '★'.repeat(Math.round(averageRating)) + '☆'.repeat(5 - Math.round(averageRating));
    const stats = await Stats.findOne().lean() || { totalBookings: 2000, customersVisited: 5000, successfulEvents: 1500, ongoingEvents: 300 };
    res.render('index0', {
      services,
      reviews,
      averageRating,
      reviewRatingStars,
      reviewCount,
      stats,
      userName: req.session.userName,
      isAdmin: req.session.isAdmin,
    });
  } catch (error) {
    console.error('Index0 render error:', error);
    res.render('index0', { services: [], reviews: [], averageRating: 5, reviewRatingStars: '★★★★★', reviewCount: 0, stats: { totalBookings: 2000, customersVisited: 5000, successfulEvents: 1500, ongoingEvents: 300 }, userName: req.session.userName, isAdmin: req.session.isAdmin });
  }
});
app.get('/login', (req, res) => res.render('login', { errorMessage: null }));
app.get('/otp', (req, res) => res.render('otp', { errorMessage: null }));
app.get('/newpassword', (req, res) => res.render('new_password', { errorMessage: null }));
app.get('/forget', (req, res) => res.render('forgot_password', { errorMessage: null }));

app.post('/create-payment-order', requireLogin, async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
    }

    const orderPayload = {
      amount: BOOKING_ADVANCE_AMOUNT * 100,
      currency: 'INR',
      receipt: `wedding_${Date.now()}`,
      notes: {
        userName: req.session.userName,
      },
    };

    const authHeader = Buffer
      .from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`)
      .toString('base64');

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const order = await razorpayResponse.json();
    if (!razorpayResponse.ok) {
      return res.status(500).json({
        success: false,
        message: order.error?.description || 'Unable to create payment order',
      });
    }

    return res.json({
      success: true,
      order,
      amount: BOOKING_ADVANCE_AMOUNT,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Create Payment Order Error:', error.message);
    return res.status(500).json({ success: false, message: 'Payment initialization failed' });
  }
});

app.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const registerBookings = await Register.find({ UserName: req.session.userName }).sort({ createdAt: -1 }).lean();
    const serviceBookings = await Booking.find({ userName: req.session.userName }).sort({ createdAt: -1 }).lean();

    res.render('dashboard', {
      bookings: registerBookings,
      serviceBookings,
      userName: req.session.userName,
    });
  } catch (error) {
    console.error('Dashboard Error:', error.message);
    res.status(500).send('Failed to load dashboard');
  }
});

app.post('/dashboard/cancel/:id', requireLogin, async (req, res) => {
  try {
    const bookingId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.redirect('/dashboard');
    }

    const cancelledBooking = await Register.findOneAndDelete({
      _id: bookingId,
      UserName: req.session.userName,
    }).lean();

    if (!cancelledBooking) {
      return res.redirect('/dashboard');
    }

    await removeBookingFromStats(cancelledBooking.status);

    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && ADMIN_EMAIL) {
      const services = (cancelledBooking.Service || []).join(', ');
      const mailText = `Wedding booking cancelled:\n\nUserName: ${cancelledBooking.UserName}\nName: ${cancelledBooking.Name}\nMobile Number: ${cancelledBooking.Mobile_no}\nWedding Address: ${cancelledBooking.Wedding_Address}\nWedding Date From: ${cancelledBooking.Wedding_date_From}\nWedding Date To: ${cancelledBooking.Wedding_date_To}\nServices: ${services || 'N/A'}\nNo. of Guests: ${cancelledBooking.No_of_Guests}\nAdvance Paid: INR ${cancelledBooking.Advance_Amount || 5000}\nPayment Id: ${cancelledBooking.Payment_Id || 'N/A'}\nOrder Id: ${cancelledBooking.Payment_Order_Id || 'N/A'}\nCancelled At: ${new Date().toISOString()}`;

      await mailTransporter.sendMail({
        from: process.env.GMAIL_USER,
        to: ADMIN_EMAIL,
        subject: 'Wedding Booking Cancelled',
        text: mailText,
      });
    }

    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Cancel Booking Error:', error.message);
    return res.redirect('/dashboard');
  }
});

// Cancel a service booking (only allowed when pending or accepted)
app.post('/bookings/cancel/:id', requireLogin, async (req, res) => {
  try {
    const bookingId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) return res.redirect('/dashboard');

    const booking = await Booking.findOne({ _id: bookingId, userName: req.session.userName }).lean();
    if (!booking) return res.redirect('/dashboard');

    // Only allow cancellation when pending or accepted
    if (booking.status === 'pending' || booking.status === 'accepted') {
      await Booking.findByIdAndDelete(bookingId);
      await removeBookingFromStats(booking.status);
    }

    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Cancel service booking error:', error.message);
    return res.redirect('/dashboard');
  }
});

/* ---------------- Signup ---------------- */

app.post('/signup', async (req, res) => {
  const { UserName, Password, Confirm_Password, Mobile_No, Gmail } = req.body;

  const hasLetter = /[A-Za-z]/;
  const hasNumber = /[0-9]/;
  const isValidFormat = /^[A-Za-z\d]{6,15}$/;

  if (!UserName || !Password || !Mobile_No || !Gmail) {
    return res.render('signup', { errorMessage: 'All fields are required' });
  }

  if (!isValidFormat.test(UserName)) {
    return res.render('signup', { errorMessage: 'Username must be 6-15 characters' });
  }
  if (!hasLetter.test(UserName)) {
    return res.render('signup', { errorMessage: 'Username must contain at least one letter' });
  }
  if (!hasNumber.test(UserName)) {
    return res.render('signup', { errorMessage: 'Username must contain at least one number' });
  }

  if (Password.length < 8 || Password.length > 20) {
    return res.render('signup', { errorMessage: 'Password must be 8-20 characters' });
  }
  if (Password !== Confirm_Password) {
    return res.render('signup', { errorMessage: 'Passwords do not match' });
  }

  try {
    const existingUser = await User.findOne({ UserName });
    if (existingUser) {
      return res.render('signup', { errorMessage: 'User Already Exists!' });
    }

    const newUser = new User({ UserName, Password, Mobile_No, Gmail });
    await newUser.save();

    // Increment customer visited count
    await Stats.findOneAndUpdate({}, { $inc: { customersVisited: 1 } }, { upsert: true });

    return res.redirect('/login');
  } catch (error) {
    console.error(error);
    return res.render('signup', { errorMessage: 'Error signing up user!' });
  }
});

/* ---------------- Register ---------------- */

app.post('/register', requireLogin, async (req, res) => {
  try {
    const payment = req.body.payment || {};
    const { orderId, paymentId, signature } = payment;
    if (!orderId || !paymentId || !signature || !process.env.RAZORPAY_KEY_SECRET) {
      return res.json({ success: false, message: 'Payment verification failed' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.json({ success: false, message: 'Invalid payment signature' });
    }

    const bookingData = {
      ...req.body,
      UserName: req.session.userName,
      Service: Array.isArray(req.body.Service)
        ? req.body.Service
        : req.body.Service
          ? [req.body.Service]
          : [],
      Advance_Amount: BOOKING_ADVANCE_AMOUNT,
      Payment_Order_Id: orderId,
      Payment_Id: paymentId,
      Payment_Status: 'paid',
    };

    const newRegister = new Register(bookingData);
    await newRegister.save();
    await incrementStats({
      totalBookings: 1,
      ongoingEvents: 1,
      advanceTotal: BOOKING_ADVANCE_AMOUNT,
      totalEarnings: BOOKING_ADVANCE_AMOUNT,
    });
    const bookingTime = newRegister.createdAt || new Date();

    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && ADMIN_EMAIL) {
      const services = bookingData.Service.join(', ');
      const mailText = `New wedding booking received:\n\nUserName: ${bookingData.UserName}\nName: ${bookingData.Name}\nMobile Number: ${bookingData.Mobile_no}\nWedding Address: ${bookingData.Wedding_Address}\nWedding Date From: ${bookingData.Wedding_date_From}\nWedding Date To: ${bookingData.Wedding_date_To}\nServices: ${services || 'N/A'}\nNo. of Guests: ${bookingData.No_of_Guests}\nAdvance Paid: INR ${bookingData.Advance_Amount}\nPayment Id: ${bookingData.Payment_Id}\nOrder Id: ${bookingData.Payment_Order_Id}`;

      await mailTransporter.sendMail({
        from: process.env.GMAIL_USER,
        to: ADMIN_EMAIL,
        subject: 'New Wedding Booking',
        text: mailText,
      });
    } else {
      console.warn('Email credentials missing: booking saved but admin email not sent.');
    }

    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      const customer = await User.findOne({ UserName: req.session.userName }).lean();
      if (customer && customer.Gmail) {
        const customerMailText = `Hello ${bookingData.Name},\n\nYour wedding booking advance payment has been received successfully.\n\nPayment Details:\nPayment Id: ${bookingData.Payment_Id}\nOrder Id: ${bookingData.Payment_Order_Id}\nAmount Paid: INR ${bookingData.Advance_Amount}\nPayment Time: ${new Date(bookingTime).toLocaleString('en-IN')}\nStatus: ${bookingData.Payment_Status}\n\nBooking Details:\nWedding Date From: ${bookingData.Wedding_date_From}\nWedding Date To: ${bookingData.Wedding_date_To}\nAddress: ${bookingData.Wedding_Address}\n\nThank you,\nABG Weddings`;

        await mailTransporter.sendMail({
          from: process.env.GMAIL_USER,
          to: customer.Gmail,
          subject: 'Payment Receipt - Wedding Booking',
          text: customerMailText,
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Register/Email Error:', error.message);
    res.json({ success: false });
  }
});

/* ---------------- Login ---------------- */

app.post('/login', async (req, res) => {
  const { UserName, Password } = req.body;

  try {
    if (!UserName || !Password) {
      return res.render('login', { errorMessage: 'Invalid username or password!' });
    }

    if (UserName === ADMIN_USERNAME && Password === ADMIN_PASSWORD) {
      req.session.userId = 'admin';
      req.session.userName = 'Admin';
      req.session.isAdmin = true;
      return res.redirect('/admin');
    }

    const user = await User.findOne({ UserName });
    if (!user) {
      return res.render('login', { errorMessage: 'Invalid username' });
    }

    const isPasswordCorrect = await user.comparePassword(Password);
    if (!isPasswordCorrect) {
      return res.render('login', { errorMessage: 'Incorrect password!' });
    }

    req.session.userId = user._id.toString();
    req.session.userName = user.UserName;
    req.session.isAdmin = false;

    return res.redirect('/index');

  } catch (error) {
    console.error('Server Error:', error);
    return res.render('login', { errorMessage: 'Server Error' });
  }
});

app.post('/reviews', async (req, res) => {
  try {
    const { name, text, rating } = req.body;
    if (!name || !text) {
      return res.redirect(req.get('referer') || '/');
    }

    const review = new Review({
      name,
      text,
      rating: rating ? Number(rating) : 5,
    });
    await review.save();
    res.redirect(req.get('referer') || '/');
  } catch (error) {
    console.error('Review save error:', error);
    res.redirect(req.get('referer') || '/');
  }
});

/* ---------------- Booking Routes ---------------- */

app.post('/api/bookings', requireLogin, async (req, res) => {
  try {
    const { serviceId, serviceName, eventDate, notes } = req.body;
    
    if (!serviceId || !serviceName) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const booking = new Booking({
      userName: req.session.userName,
      serviceId,
      serviceName,
      eventDate: eventDate ? new Date(eventDate) : null,
      notes,
      // new bookings are requests -> admin must accept
      status: 'pending',
    });

    await booking.save();
    await incrementStats({
      totalBookings: 1,
      ongoingEvents: 1,
      advanceTotal: BOOKING_ADVANCE_AMOUNT,
      totalEarnings: BOOKING_ADVANCE_AMOUNT,
    });
    // Notify admin by email (optional)
    try {
      if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && ADMIN_EMAIL) {
        const mailText = `New service booking request:\n\nUser: ${req.session.userName}\nService: ${serviceName}\nEvent Date: ${eventDate || 'N/A'}\nNotes: ${notes || '-'}\n`;
        await mailTransporter.sendMail({ from: process.env.GMAIL_USER, to: ADMIN_EMAIL, subject: 'New Service Booking Request', text: mailText });
      }
    } catch (err) {
      console.warn('Failed to send admin booking notification:', err.message);
    }

    res.json({ success: true, message: 'Booking request submitted', bookingId: booking._id });
  } catch (error) {
    console.error('Booking create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create booking' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await Stats.findOne().lean() || { totalBookings: 2000, customersVisited: 5000, successfulEvents: 1500, ongoingEvents: 300 };
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

/* ---------------- Logout ---------------- */

app.get('/logout', (req, res) => {
  if (!req.session) {
    return res.status(400).send('No active session to log out.');
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Error logging out');
    }
    return res.redirect('/index0');
  });
});

/* ---------------- Server ---------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
