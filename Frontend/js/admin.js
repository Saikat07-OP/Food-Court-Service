// ==========================================
// UTILITY: BACKEND URL & LOADERS
// ==========================================
function getBackendURL() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000'; 
    }
    return 'https://food-court-service-backend.onrender.com'; 
}

function showLoader(text = "Loading...") {
    const loader = document.getElementById('globalLoader');
    const textEl = document.getElementById('loaderText');
    if (loader && textEl) {
        textEl.innerText = text;
        loader.classList.add('active');
    }
}

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.remove('active');
}

// ==========================================
// 1. POPUP & NOTIFICATION SYSTEM (No Alerts)
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return; 

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);

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
// 2. INITIALIZATION & NAVIGATION (With Memory)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(sessionStorage.getItem('user'));

    if (!user || user.role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('adminName').textContent = user.name;
    document.getElementById('currentDate').textContent = new Date().toDateString();

    const lastSection = sessionStorage.getItem('adminActiveSection') || 'overview';
    showSection(lastSection);
});

function showSection(sectionId) {
    const sections = {
        'overview': 'overviewSection',
        'manage-users': 'manageUsersSection',
        'manage-menu': 'manageMenuSection'
    };

    Object.values(sections).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const activeEl = document.getElementById(sections[sectionId]);
    if (activeEl) activeEl.style.display = 'block';

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(`'${sectionId}'`)) {
            link.classList.add('active');
        }
    });

    // SAVE TAB STATE: Remembers where the admin is!
    sessionStorage.setItem('adminActiveSection', sectionId);

    if (sectionId === 'overview') {
        loadOverview();
        loadUsers();
    }
    if (sectionId === 'manage-users') loadUsers();

    if (sectionId === 'manage-menu') {
        loadAdminMenu();
        loadCanteenStatus();
    }
}

// ==========================================
// OVERVIEW DASHBOARD DATA
// ==========================================
async function loadOverview(selectedDate = null) {
    showLoader("Loading Dashboard..."); 
    try {
        const token = sessionStorage.getItem('token');
        const backendURL = getBackendURL();
        const dateToFetch = selectedDate || new Date().toISOString().split('T')[0];
        
        const dateInput = document.getElementById('overviewDate');
        if (dateInput) dateInput.value = dateToFetch;

        const summaryRes = await axios.get(`${backendURL}/api/staff/summary?date=${dateToFetch}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const summary = summaryRes.data.summary;
        document.getElementById('totalOrders').innerText = summary.totalOrders || 0;
        document.getElementById('totalRevenue').innerText = `₹${summary.totalRevenue || 0}`;

        const ordersRes = await axios.get(`${backendURL}/api/orders/manage/all?limit=50&date=${dateToFetch}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const recentOrders = ordersRes.data.orders;
        const recentList = document.getElementById('recentOrdersList');

        if (!recentOrders || recentOrders.length === 0) {
            recentList.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-gray);">
                <i class="fas fa-clipboard-check" style="font-size:2rem; display:block; margin-bottom:10px;"></i>
                No successful transactions found for this date.
            </div>`;
        } else {
            recentList.innerHTML = recentOrders.map(order => `
                <div style="border-bottom: 1px solid var(--border); padding: 12px 0; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: var(--text-dark);">#${order.order_id}</strong>
                        <p style="font-size: 0.8rem; color: var(--text-gray); margin-top: 2px;">
                            ${order.user_id ? order.user_id.name : 'Unknown User'} &bull; 
                            ${new Date(order.order_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <span style="color: #10b981; font-weight: 700;">₹${order.total_amount}</span>
                        <p style="font-size: 0.7rem; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px; text-transform: uppercase;">
                            ${order.order_status}
                        </p>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error("Overview Load Error:", err);
        showToast("Failed to load dashboard data", "error");
    } finally {
        hideLoader(); 
    }
}

function handleDateChange() {
    const pickedDate = document.getElementById('overviewDate').value;
    if (pickedDate) {
        document.getElementById('recentOrdersList').innerHTML = '<p style="color:var(--text-gray); margin-top:10px;">Loading data...</p>';
        loadOverview(pickedDate);
    }
}

// ==========================================
// 3. USER MANAGEMENT
// ==========================================
async function loadUsers() {
    showLoader("Loading Users..."); 
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Fetching users...</td></tr>';

    try {
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
    } finally {
        hideLoader(); 
    }
}

async function handleUserSubmit(event) {
    event.preventDefault();
    
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

    showLoader("Adding User..."); 
    try {
        await api.addUser(userData);
        showToast("User added successfully!", "success");
        closeModals();
        loadUsers();
    } catch (err) {
        console.error("Add User Error:", err);
        showToast(err.response?.data?.message || "Error adding user to database", "error");
    } finally {
        hideLoader(); 
    }
}

function triggerDeleteUser(id) {
    showConfirm("Are you sure you want to permanently delete this user?", async () => {
        showLoader("Deleting User..."); 
        try {
            await api.deleteUser(id);
            showToast("User deleted successfully.", "success");
            loadUsers();
        } catch (err) {
            showToast("Failed to delete user.", "error");
        } finally {
            hideLoader(); 
        }
    });
}

// ==========================================
// 4. MENU MANAGEMENT
// ==========================================
async function loadAdminMenu() {
    showLoader("Loading Menu..."); 
    const grid = document.getElementById('adminMenuGrid');
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Loading menu...</p>';

    try {
        const response = await api.getMenu();
        const menu = response.menu || response;
        let html = '';

        for (const [category, items] of Object.entries(menu)) {
            if (Array.isArray(items)) {
                items.forEach(item => {
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
    } finally {
        hideLoader(); 
    }
}

async function handleMenuSubmit(event) {
    event.preventDefault();

    const dishData = {
        dish_name: document.getElementById('dishName').value,
        price: Number(document.getElementById('dishPrice').value), 
        category: document.getElementById('dishCategory').value,
        image_url: document.getElementById('dishImg').value,
        available_quantity: Number(document.getElementById('dishQuantity').value) 
    };

    showLoader("Adding Dish..."); 
    try {
        await api.addMenuItem(dishData);
        showToast("Dish added successfully!", "success");
        closeModals();
        loadAdminMenu();
    } catch (err) {
        showToast(err.response?.data?.message || "Error adding dish.", "error");
    } finally {
        hideLoader(); 
    }
}

function triggerDeleteItem(id) {
    showConfirm("Remove this dish from the canteen menu?", async () => {
        showLoader("Removing Dish..."); 
        try {
            await api.deleteMenuItem(id);
            showToast("Dish removed from menu.", "success");
            loadAdminMenu();
        } catch (err) {
            showToast("Failed to delete dish.", "error");
        } finally {
            hideLoader(); 
        }
    });
}

// ==========================================
// CUSTOM STOCK UPDATE MODAL SYSTEM
// ==========================================
let currentStockUpdateId = null;

function triggerUpdateStock(id, dishName, currentQty) {
    currentStockUpdateId = id;
    document.getElementById('stockDishName').textContent = dishName;
    document.getElementById('newStockInput').value = currentQty;
    document.getElementById('stockModal').style.display = 'block';
}

function closeStockModal() {
    document.getElementById('stockModal').style.display = 'none';
    currentStockUpdateId = null;
}

async function submitUpdateStock() {
    const newQtyStr = document.getElementById('newStockInput').value;
    const dishName = document.getElementById('stockDishName').textContent;

    if (newQtyStr.trim() === '') return showToast("Quantity cannot be empty.", "error");

    const newQty = parseInt(newQtyStr, 10);
    if (isNaN(newQty) || newQty < 0) {
        return showToast("Please enter a valid number (0 or higher).", "error");
    }

    showLoader(`Updating ${dishName}...`); 
    try {
        const token = sessionStorage.getItem('token');
        const backendURL = getBackendURL();

        await axios.put(`${backendURL}/api/menu/${currentStockUpdateId}`,
            { available_quantity: newQty },
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        showToast(`${dishName} stock updated to ${newQty}!`, "success");

        closeStockModal();
        loadAdminMenu(); 
    } catch (err) {
        console.error("Update Stock Error:", err);
        showToast(err.response?.data?.message || "Failed to update stock.", "error");
    } finally {
        hideLoader(); 
    }
}

// ==========================================
// SEARCH & CANTEEN TOGGLE LOGIC
// ==========================================
function filterMenu() {
    const query = document.getElementById('menuSearch').value.toLowerCase();
    const cards = document.querySelectorAll('#adminMenuGrid .card');
    
    cards.forEach(card => {
        const dishName = card.querySelector('h4').textContent.toLowerCase();
        card.style.display = dishName.includes(query) ? 'block' : 'none';
    });
}

async function loadCanteenStatus() {
    try {
        const backendURL = getBackendURL();
        const res = await axios.get(`${backendURL}/api/menu/status`);
        updateToggleButton(res.data.isOpen);
    } catch (err) { 
        console.error("Status check failed:", err.response || err); 
    }
}

async function toggleCanteenStatus() {
    showLoader("Updating Status..."); 
    try {
        const token = sessionStorage.getItem('token');
        const backendURL = getBackendURL();
        
        const res = await axios.post(`${backendURL}/api/menu/status/toggle`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        updateToggleButton(res.data.isOpen);
        showToast(res.data.message, res.data.isOpen ? "success" : "error");
    } catch (err) { 
        console.error("Toggle Error details:", err.response || err);
        const errorMsg = err.response?.data?.message || "Failed to change status";
        showToast(errorMsg, "error"); 
    } finally {
        hideLoader(); 
    }
}

function updateToggleButton(isOpen) {
    const btn = document.getElementById('canteenToggleBtn');
    if (!btn) return;
    btn.innerHTML = isOpen ? '<i class="fas fa-store"></i> Canteen OPEN' : '<i class="fas fa-store-slash"></i> Canteen CLOSED';
    btn.style.background = isOpen ? '#10b981' : '#ef4444'; 
}

// ==========================================
// 5. MODAL CLOSING & LOGOUT UTILITIES
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
    sessionStorage.clear();
    window.location.href = 'login.html';
}

window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        closeModals();
        closeConfirmModal();
        closeStockModal();
    }
};