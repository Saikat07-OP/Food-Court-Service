const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : 'https://food-court-service-backend.onrender.com/api';

const api = {
    async request(method, endpoint, data = null) {
        const token = sessionStorage.getItem('token');
        const config = {
            method,
            url: `${API_BASE}${endpoint}`,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            }
        };
        if (data) config.data = data;

        try {
            const res = await axios(config);
            return res.data;
        } catch (err) {
            console.error("API Error:", err);
            throw err;
        }
    },

    // --- Auth Login ---
    login: (credentials) => api.request('POST', '/auth/login', credentials),

    // --- Menu Methods ---
    getMenu: () => api.request('GET', '/menu/today'),
    getAllMenuItems: () => api.request('GET', '/menu/manage/all'),
    addMenuItem: (itemData) => api.request('POST', '/menu', itemData),
    deleteMenuItem: (id) => api.request('DELETE', `/menu/${id}`),

    // --- Order Methods ---
    getMyOrders: () => api.request('GET', '/orders/my-orders'),

    // --- NEW: Admin User Management Methods ---
    getUsers: () => api.request('GET', '/admin/users'),
    addUser: (userData) => api.request('POST', '/admin/users', userData),
    deleteUser: (id) => api.request('DELETE', `/admin/users/${id}`),

    // --- Payment, Order---
    placeOrder: (data) => api.request('POST', '/orders', data),
    createRazorpayOrder: (data) => api.request('POST', '/payment/create-order', data),
    verifyRazorpayPayment: (data) => api.request('POST', '/payment/verify', data),
};