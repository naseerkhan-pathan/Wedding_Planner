const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  UserName: { type: String, required: true },
  Name: { type: String, required: true },
  Mobile_no: { type: String, required: true },
  Wedding_Address: { type: String, required: true },
  Wedding_date_From: { type: Date, required: true },
  Wedding_date_To: { type: Date, required: true },
  Service: { type: [String], required: true },
  No_of_Guests: { type: Number, required: true },
  Advance_Amount: { type: Number, required: true, default: 5000 },
  Payment_Order_Id: { type: String, required: true },
  Payment_Id: { type: String, required: true },
  Payment_Status: { type: String, required: true, default: 'paid' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);
