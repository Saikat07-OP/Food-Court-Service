const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  dish_name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  }
});

const orderSchema = new mongoose.Schema({
  order_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  payment_status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  order_status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'],
    default: 'pending'
  },
  payment_id: {
    type: String,
    trim: true
  },
  qr_code_data: {
    type: String,
    trim: true
  },
  order_date: {
    type: Date,
    default: Date.now
  },
  served_date: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Generate unique order ID
orderSchema.pre('save', async function() { 
  // Notice we removed 'next' from the parentheses!
  
  if (this.isNew && !this.order_id) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    this.order_id = `ORD${timestamp}${random}`;
  }
  
  // No next() needed here anymore! Modern Mongoose handles it automatically.
});

// Index for efficient queries
orderSchema.index({ user_id: 1, order_date: -1 });
orderSchema.index({ order_status: 1, order_date: -1 });
orderSchema.index({ payment_status: 1, order_date: -1 });

module.exports = mongoose.model('Order', orderSchema);