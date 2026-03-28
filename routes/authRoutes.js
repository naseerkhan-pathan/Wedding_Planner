const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const otpStore = new Map();

// Gmail transporter setup (use App Password, not regular password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,         
    pass: process.env.GMAIL_APP_PASSWORD 
  }
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/send-otp', async (req, res) => {
  const { username } = req.body;

  if (!username) return res.render('forgot_password', { errorMessage: 'Username is required' });

  try {
    const user = await User.findOne({ UserName: username });
    if (!user) return res.render('forgot_password', { errorMessage: 'User not found'});

    const otp = generateOTP();
    req.session.otp = otp;
    const expiresAt = Date.now() + 5 * 60 * 1000; 
    req.session.otpExpiresAt = expiresAt;
    req.session.username = username; 

    // Save OTP in memory
    otpStore.set(username, { otp, expiresAt });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: user.Gmail,
      subject: 'Your OTP Code',
      text: `Hello ${username},\n\nYour OTP code is: ${otp}\nIt will expire in 5 minutes.`
    });
    const email = user.Gmail;
    res.send(`
  <script>
    alert('OTP sent to your registered email address: ${email}');
    window.location.href = '/otp';
  </script>  
  `);
  } catch (err) {
    console.error('Error sending OTP:', err);
    return res.render('forgot_password', { errorMessage: 'Failed to send OTP' });
  }
});
// ✅ GET /otp - show OTP form only if session exists
router.get('/otp', (req, res) => {
  if (!req.session.username) {
    return res.send(`
      <script>
        alert('Session expired. Please enter your username again.');
        window.location.href = '/forgot-password'; // or your username input page
      </script>
    `);
  }
  res.render('otp');
});

router.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;

  if (!otp) return res.render('otp', { errorMessage: 'OTP is required' });
  const sessionOtp = req.session.otp;
  const otpExpiresAt = req.session.otpExpiresAt;

  if (!sessionOtp || !otpExpiresAt) {
    return res.render('otp', { errorMessage: 'No OTP request found or session expired' });
  }

  if (Date.now() > otpExpiresAt) {
    req.session.otp = null;
    req.session.otpExpiresAt = null;
    return res.render('otp', { errorMessage:'OTP expired'});
  }

  if (sessionOtp !== otp) {
    return res.render('otp', { errorMessage:'Invalid OTP'});
  }

  const username = [...otpStore.entries()].find(([_, value]) => value.otp === otp)?.[0];

  if (!username) {
    return res.render('otp', { errorMessage:'User not found for the given OTP'});
  }

  req.session.otp = null;
  req.session.otpExpiresAt = null;
  otpStore.delete(username)
  req.session.username = username;
  res.send(`
    <script>
      alert('OTP validated successfully...');
      window.location.href = '/newpassword'; 
    </script>
  `);
});

router.post('/resend-otp', async (req, res) => {
  const username = req.session.username;

  if (!username) {
    return res.render('otp', { errorMessage:'Session expired. Please enter your username again.'});
  }
  try {
    const user = await User.findOne({ UserName: username });
    if (!user) return res.render('otp', { errorMessage:'User not found'});

    const existingOtpData = otpStore.get(username);
    const now = Date.now();

    let otp, expiresAt;

    if (existingOtpData && existingOtpData.expiresAt > now) {
      otp = existingOtpData.otp;
      expiresAt = existingOtpData.expiresAt;
    } else {
      otp = generateOTP();
      expiresAt = now + 5 * 60 * 1000;
      otpStore.set(username, { otp, expiresAt });
    }
    req.session.otp = otp;
    req.session.otpExpiresAt = expiresAt;

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: user.Gmail,
      subject: 'Your OTP Code (Resent)',
      text: `Hello ${username},\n\nYour OTP code is: ${otp}\nIt will expire in 5 minutes.`
    });

    res.send(`
      <script>
        alert('OTP resent to your registered email address');
        window.location.href = '/otp'; 
      </script>
    `);
  } catch (err) {
    console.error('Error resending OTP:', err);
    return res.render('otp', { errorMessage:'Failed to resend OTP'});
  }
});

router.post('/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  const username = req.session.username;

  if (!username || !newPassword) {
    return res.render('new_password', { errorMessage:'User session or new password missing'});
  }
  try {
    const hashed = await bcrypt.hash(newPassword, 10);

    const result = await User.updateOne(
      { UserName: username },
      { $set: { Password: hashed } }
    );

    if (result.matchedCount === 0) {
      return res.render('new_password', { errorMessage:'User not found'});
    }
    req.session.destroy();
    res.send(`
      <script>
        alert('Password reset successful! Please login again.');
        window.location.href = '/login'; 
      </script>
    `);
  } catch (err) {
    console.error('Error resetting password:', err);
    return res.render('new_password', { errorMessage:'Server error'});
  }
});

module.exports = router;
