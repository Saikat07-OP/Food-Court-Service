const dns = require('dns');
// Force Node to use Google's Public DNS
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payment');




const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// 1. Serve Static Files from the 'Frontend' folder
app.use(express.static(path.join(__dirname, '../Frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Database Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log("DB Error:", err));

// Routes
// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/staff', require('./routes/staff'));
// Add other routes (users, staff) here as needed

// 2. Default Route: Send users to login.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/html/login.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));