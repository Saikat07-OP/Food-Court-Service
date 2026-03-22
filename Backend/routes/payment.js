const express = require('express');
require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();


// Initialize Razorpay using your .env keys
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ==========================================
// 1. CREATE PAYMENT ORDER
// ==========================================
router.post('/create-order', authenticate, [
  body('order_id').notEmpty().withMessage('Order ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { order_id } = req.body;

    // Get order details
    const order = await Order.findOne({ order_id, user_id: req.user._id });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.payment_status !== 'pending') {
      return res.status(400).json({ message: 'Order is already paid or cancelled' });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: order.total_amount * 100, // Razorpay expects amount in paise (₹1 = 100 paise)
      currency: 'INR',
      receipt: order.order_id,
      notes: {
        user_id: req.user._id.toString(),
        order_id: order.order_id
      }
    });

    // Create a pending payment record in your database
    const payment = new Payment({
      payment_id: `PAY_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      order_id: order.order_id,
      user_id: req.user._id,
      payment_gateway_id: razorpayOrder.id,
      payer_name: req.user.name,
      amount: order.total_amount,
      status: 'created'
    });

    await payment.save();

    res.json({
      message: 'Payment order created successfully',
      razorpay_order: razorpayOrder,
      payment_id: payment.payment_id,
      amount: order.total_amount,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({ message: 'Server error while creating payment order' });
  }
});

// ==========================================
// 2. VERIFY PAYMENT & GENERATE QR CODE
// ==========================================
router.post('/verify', authenticate, [
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
  body('payment_id').notEmpty().withMessage('Payment ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, payment_id } = req.body;

    // Get the pending payment record
    const payment = await Payment.findOne({ payment_id, user_id: req.user._id });
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    // Verify payment signature securely
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // Update payment record to successful
    payment.payment_gateway_id = razorpay_payment_id;
    payment.status = 'captured';
    payment.payment_time = new Date();
    await payment.save();

    // Get order details
    const order = await Order.findOne({ order_id: payment.order_id });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update order payment status
    order.payment_status = 'paid';
    order.payment_id = payment_id;
    await order.save();

    // Generate specific QR code data for the canteen staff to scan
    const qrData = {
      order_id: order.order_id,
      payer_name: req.user.name,
      college_id: req.user.college_id,
      items: order.items.map(item => ({
        dish: item.dish_name,
        qty: item.quantity
      })),
      amount: order.total_amount,
      payment_status: 'PAID',
      payment_time: payment.payment_time
    };

    // Generate the Base64 QR code image
    const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData));

    // Save QR code data string to the order
    order.qr_code_data = JSON.stringify(qrData);
    await order.save();

    res.json({
      message: 'Payment verified successfully',
      payment,
      order,
      qr_code: qrCodeDataUrl,
      qr_data: qrData
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ message: 'Server error while verifying payment' });
  }
});

// ==========================================
// 3. GET PAYMENT HISTORY (Student)
// ==========================================

router.get('/history', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user._id;

    let filter = { 
        user_id: userId, 
        status: { $in: ['captured', 'refunded'] } 
    };

    const payments = await Payment.find(filter)
      .sort({ payment_time: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      message: 'Payment history retrieved successfully',
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ message: 'Server error while fetching payment history' });
  }
});

// ==========================================
// 4. GET SINGLE PAYMENT BY ID
// ==========================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    let payment;
    // Admins and staff can view any payment; Students can only view their own
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      payment = await Payment.findById(id);
    } else {
      payment = await Payment.findOne({ payment_id: id, user_id: userId });
    }

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({
      message: 'Payment retrieved successfully',
      payment
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ message: 'Server error while fetching payment' });
  }
});

// ==========================================
// 5. PROCESS REFUND (Admin Only)
// ==========================================
router.post('/:id/refund', authenticate, authorize('admin'), [
  body('refund_amount').isNumeric().withMessage('Refund amount must be a number').isFloat({ min: 0 }).withMessage('Refund amount must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { refund_amount, reason } = req.body;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'captured') {
      return res.status(400).json({ message: 'Cannot refund. Payment is not captured.' });
    }

    if (refund_amount > payment.amount) {
      return res.status(400).json({ message: 'Refund amount cannot exceed payment amount' });
    }

    // Process refund directly with Razorpay
    try {
      const refund = await razorpay.payments.refund(payment.payment_gateway_id, {
        amount: refund_amount * 100 // Convert to paise
      });

      // Update payment record
      payment.refund_id = refund.id;
      payment.refund_amount = refund_amount;
      payment.refund_time = new Date();
      payment.status = 'refunded';
      await payment.save();

      // Update order status
      const order = await Order.findOne({ order_id: payment.order_id });
      if (order) {
        order.payment_status = 'refunded';
        await order.save();
      }

      res.json({
        message: 'Refund processed successfully',
        refund,
        payment
      });
    } catch (razorpayError) {
      console.error('Razorpay refund error:', razorpayError);
      res.status(500).json({ message: 'Failed to process refund with payment gateway' });
    }
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({ message: 'Server error while processing refund' });
  }
});

// ==========================================
// 6. GET ALL PAYMENTS (Admin/Staff Only)
// ==========================================
router.get('/manage/all', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, date, userId } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.status = status;
    if (userId) filter.user_id = userId;

    // Date filtering logic
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter.payment_time = { $gte: startOfDay, $lte: endOfDay };
    }

    const payments = await Payment.find(filter)
      .sort({ payment_time: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(filter);

    res.json({
      message: 'Payments retrieved successfully',
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({ message: 'Server error while fetching payments' });
  }
});

// ==========================================
// CREATE WALLET RECHARGE ORDER
// ==========================================
router.post('/recharge/create', authenticate, async (req, res) => {
    try {
        const { amount } = req.body;
        
        // 1. Shorten the receipt to stay well under Razorpay's 40-character limit!
        const shortId = req.user._id.toString().substring(18); // Just grab the last 6 chars of user ID
        const safeReceipt = `rcg_${shortId}_${Date.now()}`; 
        
        const options = {
            amount: amount * 100, // Convert to paise
            currency: "INR",
            receipt: safeReceipt
        };
        
        const razorpayOrder = await razorpay.orders.create(options);
        
        res.json({ 
            razorpay_order: razorpayOrder, 
            key_id: process.env.RAZORPAY_KEY_ID 
        });
    } catch (error) {
        // 2. Print the exact reason to your backend terminal
        console.error('EXACT RECHARGE ERROR:', error);
        
        // 3. Send the exact reason to the frontend alert box!
        res.status(500).json({ 
            message: error.error ? error.error.description : error.message 
        });
    }
});

// ==========================================
// VERIFY RECHARGE & ADD FUNDS
// ==========================================
router.post('/recharge/verify', authenticate, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        // Verify the payment is legit
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ message: 'Invalid payment signature' });
        }

        //Surgically inject the money using $inc (Bypasses the buggy User hook!)
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $inc: { wallet_balance: Number(amount) } },
            { new: true } // This tells Mongo to return the updated user to us
        );

        res.json({ 
            message: 'Wallet recharged successfully!', 
            new_balance: updatedUser.wallet_balance 
        });
    } catch (error) {
        console.error('Recharge Verify Error:', error);
        res.status(500).json({ message: 'Server error while verifying recharge' });
    }
});

module.exports = router;