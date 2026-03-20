// ==========================================
// 1. POPUP & NOTIFICATION SYSTEM (No Alerts)
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return; // Failsafe if HTML is missing

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    // Auto-remove after animation
    setTimeout(() => {
        toast.remove();
    }, 3300);
}

let confirmActionCallback = null;

function showConfirm(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').style.display = 'block';
    confirmActionCallback = callback;
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmActionCallback = null;
}

// Attach listener to the Yes button only once
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmYesBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (confirmActionCallback) confirmActionCallback();
            closeConfirmModal();
        });
    }
});


// ==========================================
// 2. INITIALIZATION & NAVIGATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('user'));

    // Security Kick-out
    if (!user || user.role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('adminName').textContent = user.name;
    document.getElementById('currentDate').textContent = new Date().toDateString();

    showSection('overview');
});

function showSection(sectionId) {
    const sections = {
        'overview': 'overviewSection',
        'manage-users': 'manageUsersSection',
        'manage-menu': 'manageMenuSection'
    };

    // Hide all
    Object.values(sections).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show active
    const activeEl = document.getElementById(sections[sectionId]);
    if (activeEl) activeEl.style.display = 'block';

    // Update Sidebar highlighting
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(`'${sectionId}'`)) {
            link.classList.add('active');
        }
    });
    if (sectionId === 'overview') {
        loadOverview();
        loadUsers();
    }

    // Load Data
    if (sectionId === 'manage-users') loadUsers();
    if (sectionId === 'manage-menu') loadAdminMenu();
}

// ==========================================
// OVERVIEW DASHBOARD DATA
// ==========================================
async function loadOverview() {
    try {
        const token = localStorage.getItem('token');
        const backendURL = 'https://food-court-service-backend.onrender.com'; // Your live Render URL

        // 1. Fetch Summary Stats for Orders and Revenue
        const summaryRes = await axios.get(`${backendURL}/api/staff/summary`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const summary = summaryRes.data.summary;

        // Update the top cards
        document.getElementById('totalOrders').innerText = summary.totalOrders || 0;
        document.getElementById('totalRevenue').innerText = `₹${summary.totalRevenue || 0}`;

        // 2. Fetch Recent Orders for the Activity List
        const ordersRes = await axios.get(`${backendURL}/api/orders/manage/all?limit=5`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const recentOrders = ordersRes.data.orders;
        const recentList = document.getElementById('recentOrdersList');

        if (recentOrders.length === 0) {
            recentList.innerHTML = '<p style="color:var(--text-gray); margin-top:10px;">No recent transactions.</p>';
        } else {
            recentList.innerHTML = recentOrders.map(order => `
                <div style="border-bottom: 1px solid var(--border); padding: 12px 0; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: var(--text-dark);">#${order.order_id || 'Unknown'}</strong>
                        <p style="font-size: 0.8rem; color: var(--text-gray); margin-top: 2px;">
                            ${order.user_id ? order.user_id.name : 'Deleted User'}
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <span style="color: ${order.payment_status === 'paid' ? '#10b981' : '#f59e0b'}; font-weight: 700;">
                            ₹${order.total_amount}
                        </span>
                        <p style="font-size: 0.75rem; color: var(--text-gray); text-transform: capitalize; margin-top: 2px;">
                            ${order.order_status}
                        </p>
                    </div>
                </div>
            `).join('');
        }

    } catch (err) {
        console.error("Overview Load Error:", err);
        document.getElementById('recentOrdersList').innerHTML = '<p style="color:red; margin-top:10px;">Failed to load overview data.</p>';
    }
}

// ==========================================
// 3. USER MANAGEMENT
// ==========================================
async function loadUsers() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Fetching users...</td></tr>';

    try {
        // Because api.js returns res.data, users is the final array
        const users = await api.getUsers();

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No users found.</td></tr>';
            return;
        }

        const countEl = document.getElementById('activeUsersCount');
        if (countEl) countEl.innerText = users.length;

        tbody.innerHTML = users.map(u => `
            <tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.college_id}</td>
                <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="triggerDeleteUser('${u._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Load Users Error:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Failed to load users from database.</td></tr>';
    }
}

async function handleUserSubmit(event) {
    event.preventDefault();

    // Safely grabbing optional fields if they exist, otherwise applying defaults for Mongoose
    const phoneInput = document.getElementById('userPhone');
    const deptInput = document.getElementById('userDept');

    const userData = {
        name: document.getElementById('userName').value,
        college_id: document.getElementById('userCollegeId').value,
        email: document.getElementById('userEmail').value,
        password: document.getElementById('userPass').value,
        role: document.getElementById('userRole').value,
        phone: phoneInput ? phoneInput.value : "0000000000",
        department: deptInput ? deptInput.value : "N/A",
        status: "active"
    };

    try {
        await api.addUser(userData);
        showToast("User added successfully!", "success");
        closeModals();
        loadUsers();
    } catch (err) {
        console.error("Add User Error:", err);
        showToast(err.response?.data?.message || "Error adding user to database", "error");
    }
}

function triggerDeleteUser(id) {
    showConfirm("Are you sure you want to permanently delete this user?", async () => {
        try {
            await api.deleteUser(id);
            showToast("User deleted successfully.", "success");
            loadUsers();
        } catch (err) {
            showToast("Failed to delete user.", "error");
        }
    });
}


// ==========================================
// 4. MENU MANAGEMENT
// ==========================================
async function loadAdminMenu() {
    const grid = document.getElementById('adminMenuGrid');
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Loading menu...</p>';

    try {
        const response = await api.getMenu();
        const menu = response.menu || response;
        let html = '';

        for (const [category, items] of Object.entries(menu)) {
            if (Array.isArray(items)) {
                items.forEach(item => {
                    // Fallback image if none provided
                    const imgSrc = item.image_url || 'https://imgs.search.brave.com/eJrOBBqXjPdhO8ejCg9Vz4Tkubh4-rLONNGdACLq9vQ/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbHVz/LnVuc3BsYXNoLmNv/bS9wcmVtaXVtX3Zl/Y3Rvci0xNzEzMzY0/MzkzMDg1LTBmZGRh/MTNlYzdjZD9mbT1q/cGcmcT02MCZ3PTMw/MDAmaXhsaWI9cmIt/NC4xLjA';

                    html += `
                    <div class="card" style="padding: 15px;">
                        <img src="${imgSrc}" style="width:100%; height:120px; object-fit:cover; border-radius:10px; margin-bottom:10px;">
                        <h4 style="margin: 5px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.dish_name}</h4>
                        
                        <p style="font-size:0.85rem; color:var(--text-gray);">
                            ₹${item.price} | <span style="text-transform:capitalize;">${category}</span><br>
                            <strong style="color: var(--primary);">Stock: ${item.available_quantity || 0}</strong>
                        </p>
                        
                        <div style="margin-top:12px; display:flex; gap:10px;">
                            <button class="btn btn-sm" style="flex:1; background: var(--primary); color: white;" 
                                    onclick="triggerUpdateStock('${item._id}', '${item.dish_name}', ${item.available_quantity || 0})">
                                <i class="fas fa-edit"></i> Stock
                            </button>
                            
                            <button class="btn btn-sm btn-danger" style="flex:1;" onclick="triggerDeleteItem('${item._id}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>`;
                });
            }
        }
        grid.innerHTML = html || '<p style="grid-column: 1/-1; text-align:center;">Menu is empty.</p>';
    } catch (err) {
        console.error("Load Menu Error:", err);
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:red;">Error loading menu.</p>';
    }
}

async function handleMenuSubmit(event) {
    event.preventDefault();

    // Grab all the data, including the new Quantity field
    const dishData = {
        dish_name: document.getElementById('dishName').value,
        price: Number(document.getElementById('dishPrice').value), // Make sure it's sent as a number
        category: document.getElementById('dishCategory').value,
        image_url: document.getElementById('dishImg').value,
        available_quantity: Number(document.getElementById('dishQuantity').value) // Dynamic Quantity!
    };

    try {
        await api.addMenuItem(dishData);
        showToast("Dish added successfully!", "success");
        closeModals();
        loadAdminMenu();
    } catch (err) {
        showToast(err.response?.data?.message || "Error adding dish.", "error");
    }
}

function triggerDeleteItem(id) {
    showConfirm("Remove this dish from the canteen menu?", async () => {
        try {
            await api.deleteMenuItem(id);
            showToast("Dish removed from menu.", "success");
            loadAdminMenu();
        } catch (err) {
            showToast("Failed to delete dish.", "error");
        }
    });
}

// ==========================================
// CUSTOM STOCK UPDATE MODAL SYSTEM
// ==========================================
let currentStockUpdateId = null;

// 1. Open the beautiful modal instead of an alert
function triggerUpdateStock(id, dishName, currentQty) {
    currentStockUpdateId = id;
    
    // Fill the modal with the current info
    document.getElementById('stockDishName').textContent = dishName;
    document.getElementById('newStockInput').value = currentQty;
    
    // Show the modal
    document.getElementById('stockModal').style.display = 'block';
}

// 2. Close the modal
function closeStockModal() {
    document.getElementById('stockModal').style.display = 'none';
    currentStockUpdateId = null;
}

// 3. Handle the actual update when they click "Update"
async function submitUpdateStock() {
    const newQtyStr = document.getElementById('newStockInput').value;
    const dishName = document.getElementById('stockDishName').textContent;
    
    if (newQtyStr.trim() === '') return showToast("Quantity cannot be empty.", "error");

    const newQty = parseInt(newQtyStr, 10);
    if (isNaN(newQty) || newQty < 0) {
        return showToast("Please enter a valid number (0 or higher).", "error");
    }

    try {
        const token = localStorage.getItem('token');
        const backendURL = 'https://food-court-service-backend.onrender.com';
        
        await axios.put(`${backendURL}/api/menu/${currentStockUpdateId}`, 
            { available_quantity: newQty }, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        showToast(`${dishName} stock updated to ${newQty}!`, "success");
        
        closeStockModal();
        loadAdminMenu(); // Refresh the cards to show the new number!
        
    } catch (err) {
        console.error("Update Stock Error:", err);
        showToast(err.response?.data?.message || "Failed to update stock.", "error");
    }
}

// ==========================================
// 5. UTILITY FUNCTIONS
// ==========================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'block';
}

function closeModals() {
    const userModal = document.getElementById('userModal');
    const menuModal = document.getElementById('menuModal');
    if (userModal) userModal.style.display = 'none';
    if (menuModal) menuModal.style.display = 'none';

    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) addUserForm.reset();

    const addMenuForm = document.getElementById('addMenuForm');
    if (addMenuForm) addMenuForm.reset();
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// Close modals if clicking outside the white box
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        closeModals();
        closeConfirmModal();
        closeStockModal();
    }
};