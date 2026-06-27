const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    userName: { type: String, required: true },  // User requesting
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true }, // Service type
    serviceName: { type: String, required: true }, // Service name (Photography, Flowers, etc.)
    // Lifecycle: pending → accepted → process started → completed
    status: { 
      type: String, 
      enum: ['pending', 'accepted', 'rejected', 'process started', 'completed', 'cancelled'], 
      default: 'pending' 
    },
    eventDate: { type: Date },                   // When event happens
    notes: { type: String },                     // Customer notes
    advanceAmount: { type: Number, default: 5000 },
    advancePaymentStatus: { type: String, default: 'paid' },
    remainingAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },   // Admin-entered total amount earned
    amountUpdatedAt: { type: Date },
    completedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
