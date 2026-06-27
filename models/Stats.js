const mongoose = require('mongoose');
const statsSchema = new mongoose.Schema(
{
  totalBookings: { type: Number, default: 2000 },
  customersVisited: { type: Number, default: 5000 },
  successfulEvents: { type: Number, default: 1500 },
  ongoingEvents: { type: Number, default: 300 },

  eventAmount: { type: Number, default: 0 },
  eventAmountPerCompletedEvent: { type: Number, default: 0 },

  // ADD THESE
  advanceTotal: { type: Number, default: 10000000 },
  eventTotal: { type: Number, default: 37500000 },
  totalEarnings: { type: Number, default: 47500000 },

  updatedAt: { type: Date, default: Date.now },
},
{ timestamps: true }
);
module.exports = mongoose.models.Stats || mongoose.model('Stats', statsSchema);
