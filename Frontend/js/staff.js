let html5QrcodeScanner = null;
let currentScannedOrderId = null;

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
// POPUP & NOTIFICATION SYSTEM (No Alerts)
// ==========================================
function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    
    // Auto-create container if missing
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
        container.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none;';
    }

    const toast = document.createElement('div');
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
    const bgColor = type === 'success' ? '#10b981' : '#ef4444';

    toast.innerHTML = `<i class="fas ${icon}" style="font-size: 1.2rem;"></i> <span style="margin-left: 10px; white-space: nowrap;">${message}</span>`;
    toast.style.cssText = `background-color: ${bgColor}; color: #ffffff; padding: 14px 24px; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2); display: flex; align-items: center; font-size: 1rem; font-weight: 500; opacity: 0; transform: translateY(20px); transition: all 0.3s ease-out;`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// INITIALIZATION & NAVIGATION (With Memory)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(sessionStorage.getItem('user'));
    
    if (!user || user.role !== 'staff') {
        window.location.href = 'login.html';
        return;
    }
    
    const staffNameEl = document.getElementById('staffName');
    if (staffNameEl) {
        staffNameEl.textContent = `Staff | ${user.name || 'Member'}`;
    }

    // Restore the last open tab (defaults to 'scan')
    const lastSection = sessionStorage.getItem('staffActiveSection') || 'scan';
    showSection(lastSection);
});

function showSection(sectionId) {
    const sections = ['scanSection', 'queueSection', 'historySection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    const activeSection = document.getElementById(`${sectionId}Section`);
    if (activeSection) {
        activeSection.style.display = 'block'; 
    }
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick').includes(`'${sectionId}'`)) {
            link.classList.add('active');
        }
    });

    // Save the current tab to storage
    sessionStorage.setItem('staffActiveSection', sectionId);

    // Load data based on the tab
    if (sectionId === 'queue') loadPendingOrders();
    if (sectionId === 'history') loadServedOrders();
    if (sectionId === 'scan') {
        document.getElementById('orderVerifyCard').style.display = 'none';
        document.getElementById('reader').style.display = 'block';
        startScanner();
    } else {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().then(() => { html5QrcodeScanner = null; });
        }
    }
    
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('active')) {
        toggleSidebar();
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

// ==========================================
// SCANNER LOGIC
// ==========================================
function startScanner() {
    if (html5QrcodeScanner) return; 

    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        false
    );
    html5QrcodeScanner.render(onScanSuccess, (err) => { /* Ignore minor scan errors */ });
}

async function onScanSuccess(decodedText) {
    if (html5QrcodeScanner) html5QrcodeScanner.pause(true);

    showLoader("Verifying QR...");

    try {
        const qrData = JSON.parse(decodedText);
        const orderId = qrData.order_id;
        
        if (!orderId) throw new Error("Invalid Format");

        const token = sessionStorage.getItem('token');
        const res = await axios.get(`${getBackendURL()}/api/staff/order/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const liveOrder = res.data.order;

        if (liveOrder.order_status === 'served') {
            hideLoader(); 
            showToast("This Order is Already Served!", "error");
            setTimeout(() => { if (html5QrcodeScanner) html5QrcodeScanner.resume(); }, 2000);
            return;
        }

        currentScannedOrderId = liveOrder.order_id;
        
        document.getElementById('dispOrderId').innerText = liveOrder.order_id;
        document.getElementById('dispName').innerText = liveOrder.user_id?.name || 'Student';
        
        document.getElementById('dispItems').innerHTML = liveOrder.items.map(i => `
            <li style="display: grid; grid-template-columns: 1fr 70px 80px; align-items: center; padding: 14px 12px; border-bottom: 1px solid #f0f0f0;">
                <span style="color: #1f2937; font-weight: 600; font-size: 0.9rem;">
                    ${i.dish_name || i.dish}
                </span>
                <span style="text-align: center; font-weight: 700; color: #4CAF50; font-size: 0.9rem;">
                    ${i.quantity || i.qty}
                </span>
                <span style="text-align: right; background: #e8f5e9; color: #4CAF50; padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: 600; justify-self: end;">
                    Ready
                </span>
            </li>
        `).join('');

        document.getElementById('orderVerifyCard').style.display = 'block';
        document.getElementById('reader').style.display = 'none';

        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().then(() => { html5QrcodeScanner = null; });
        }

    } catch (err) {
        console.error("Scan Error:", err);
        showToast("Invalid QR Code", "error");
        setTimeout(() => { if (html5QrcodeScanner) html5QrcodeScanner.resume(); }, 2000);
    } finally {
        hideLoader();
    }
}

async function confirmServe() {
    if (!currentScannedOrderId) {
        showToast("Error: No order ID found. Please re-scan.", "error");
        return;
    }

    showLoader("Serving Order...");

    try {
        const token = sessionStorage.getItem('token');
        const url = `${getBackendURL()}/api/staff/${currentScannedOrderId}/serve`;
        
        await axios.patch(url, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });

        showToast("Order Served Successfully!", "success");

        document.getElementById('orderVerifyCard').style.display = 'none';
        document.getElementById('reader').style.display = 'block';

        currentScannedOrderId = null;
        startScanner();

    } catch (err) {
        console.error("API Error:", err);
        showToast(err.response?.data?.message || "Server Communication Error", "error");
    } finally {
        hideLoader();
    }
}

// ==========================================
// DATA FETCHERS
// ==========================================
async function loadPendingOrders() {
    const list = document.getElementById('pendingList');
    if (!list) return;

    showLoader("Loading Pending Orders...");

    try {
        const token = sessionStorage.getItem('token');
        const res = await axios.get(`${getBackendURL()}/api/staff/orders/pending`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const orders = res.data.orders || res.data || [];

        if (orders.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:20px; font-size:0.8rem;">No orders waiting.</p>';
            return;
        }

        list.innerHTML = orders.map(order => {
            const items = order.items || [];
            const itemsSummary = items.map(i => {
                const name = i.dish_name || i.dish || "Unknown Item";
                return `${i.quantity || 1}x ${name}`;
            }).join(', ');

            const studentName = (order.user_id && typeof order.user_id === 'object') 
                ? order.user_id.name 
                : 'Student';

            const orderTime = order.order_date 
                ? new Date(order.order_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--:--';

            return `
                <div class="queue-item-strip" style="border-bottom: 1px solid var(--border); padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div class="queue-left">
                        <span class="queue-id" style="font-weight: 800; color: var(--primary);">#${order.order_id || 'N/A'}</span>
                        <div class="queue-student" style="font-weight: 600; color: var(--text-dark);">${studentName}</div>
                        <div class="queue-items-text" style="font-size: 0.85rem; color: var(--text-gray);">${itemsSummary}</div>
                    </div>
                    <div class="queue-right">
                        <span class="queue-time" style="font-size: 0.8rem; color: var(--text-gray); font-weight: 600;">${orderTime}</span>
                    </div>
                </div>
            `;
        }).join('');;
    } catch (err) {
        console.error("Queue Error:", err);
        showToast("Failed to load pending orders.", "error");
    } finally {
        hideLoader();
    }
}

async function loadServedOrders() {
    const list = document.getElementById('recentlyServedList');
    if (!list) return;

    showLoader("Loading Served History...");

    try {
        const token = sessionStorage.getItem('token');
        const res = await axios.get(`${getBackendURL()}/api/staff/orders/served`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const servedOrders = res.data.orders || [];

        const countEl = document.getElementById('servedCount');
        if (countEl) countEl.innerText = servedOrders.length;

        if (servedOrders.length === 0) {
            list.innerHTML = '<p style="text-align: center; padding: 10px; color:var(--text-gray); font-size:0.8rem;">No orders served yet.</p>';
            return;
        }

        list.innerHTML = servedOrders.slice(0, 5).map(order => `
            <div class="served-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border);">
                <div style="line-height: 1.2;">
                    <strong style="color:var(--text-dark); font-size: 0.9rem;">#${order.order_id}</strong>
                    <div style="font-size:0.65rem; color:var(--text-gray);">${new Date(order.served_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style="color: #10b981; font-weight: 700; font-size: 0.9rem;">₹${order.total_amount}</div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Served List Error:", err);
        showToast("Failed to load served orders.", "error");
    } finally {
        hideLoader();
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================
function logout() {
    sessionStorage.clear();
    window.location.href = 'login.html';
}