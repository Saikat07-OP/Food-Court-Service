const express = require('express');
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Menu = require('../models/Menu');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Create new order
router.post('/', authenticate, [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.dish_name').notEmpty().withMessage('Dish name is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Extract everything safely, including the order_id we send from the frontend
    const { items, notes, order_id } = req.body;
    const userId = req.user._id;

    // Get today's menu
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Validate items and calculate totals
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const menuItem = await Menu.findOne({
        dish_name: item.dish_name,
        date: { $gte: today, $lt: tomorrow },
        is_available: true
      });

      if (!menuItem) {
        return res.status(400).json({
          message: `Dish "${item.dish_name}" is not available today`
        });
      }

      if (menuItem.available_quantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient quantity for "${item.dish_name}". Available: ${menuItem.available_quantity}`
        });
      }

      const subtotal = menuItem.price * item.quantity;
      validatedItems.push({
        dish_name: item.dish_name,
        quantity: item.quantity,
        price: menuItem.price,
        subtotal
      });
      totalAmount += subtotal;
    }

    // Generate an ID if the frontend forgot it somehow
    const finalOrderId = order_id || ("ORD" + Date.now() + Math.floor(Math.random() * 1000));

    // Create order with explicit defaults to satisfy strict MongoDB schemas
    const order = new Order({
      order_id: finalOrderId,
      user_id: userId,
      items: validatedItems,
      total_amount: totalAmount,
      notes: notes || "",
      order_status: 'pending',     // Explicitly set
      payment_status: 'pending'    // Explicitly set
    });

    await order.save(); // <--- If it crashes here, our catch block will catch it!

    // Update menu quantities
    for (const item of validatedItems) {
      await Menu.updateOne(
        { dish_name: item.dish_name, date: { $gte: today, $lt: tomorrow } },
        { $inc: { available_quantity: -item.quantity } }
      );
    }

    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    // THIS IS THE MAGIC LINE: It will print the exact reason to your VS Code terminal!
    console.error('🔥 EXACT CRASH REASON:', error.stack);

    // We also send the specific error back to the frontend so it shows in the alert box
    res.status(500).json({
      message: 'Database error while creating order',
      details: error.message
    });
  }
});

// Get user's orders
router.get('/my-orders', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user._id;

    let filter = { user_id: userId };
    if (status) filter.order_status = status;

    const orders = await Order.find(filter)
      .sort({ order_date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user_id', 'name college_id email');

    const total = await Order.countDocuments(filter);

    res.json({
      message: 'Orders retrieved successfully',
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ message: 'Server error while fetching orders' });
  }
});

// Get order by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    let order;
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      order = await Order.findById(id).populate('user_id', 'name college_id email');
    } else {
      order = await Order.findOne({ _id: id, user_id: userId }).populate('user_id', 'name college_id email');
    }

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({
      message: 'Order retrieved successfully',
      order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error while fetching order' });
  }
});

// Update order status (staff/admin only)
router.patch('/:id/status', authenticate, authorize('staff', 'admin'), [
  body('status').isIn(['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Validate status transitions
    const validTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['preparing', 'cancelled'],
      'preparing': ['ready', 'cancelled'],
      'ready': ['served'],
      'served': [],
      'cancelled': []
    };

    if (!validTransitions[order.order_status].includes(status)) {
      return res.status(400).json({
        message: `Cannot change status from "${order.order_status}" to "${status}"`
      });
    }

    order.order_status = status;
    if (status === 'served') {
      order.served_date = new Date();
    }

    await order.save();

    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error while updating order status' });
  }
});

// Get all orders (admin/staff only)
router.get('/manage/all', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, date, userId } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.order_status = status;
    if (userId) filter.user_id = userId;
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter.order_date = { $gte: startOfDay, $lte: endOfDay };
    }

    const orders = await Order.find(filter)
      .sort({ order_date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user_id', 'name college_id email role');

    const total = await Order.countDocuments(filter);

    res.json({
      message: 'Orders retrieved successfully',
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ message: 'Server error while fetching orders' });
  }
});

// Cancel order (user only, for pending orders)
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ _id: id, user_id: userId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.order_status !== 'pending') {
      return res.status(400).json({
        message: 'Cannot cancel order. Order is already being processed.'
      });
    }

    if (order.payment_status === 'paid') {
      return res.status(400).json({
        message: 'Cannot cancel paid order. Please request a refund.'
      });
    }

    // Restore menu quantities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const item of order.items) {
      await Menu.updateOne(
        { dish_name: item.dish_name, date: { $gte: today, $lt: tomorrow } },
        { $inc: { available_quantity: item.quantity } }
      );
    }

    order.order_status = 'cancelled';
    await order.save();

    res.json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error while cancelling order' });
  }
});

module.exports = router;
