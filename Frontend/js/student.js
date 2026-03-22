let cart = [];

document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(sessionStorage.getItem('user'));
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    document.getElementById('studentName').textContent = user.name;
    showSection('menu');
});

// Smart URL detector!
function getBackendURL() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    return 'https://food-court-service-backend.onrender.com';
}

function showSection(sectionId) {
    const sections = ['menuSection', 'ordersSection', 'walletSection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    const activeSection = document.getElementById(`${sectionId}Section`);
    if (activeSection) {
        activeSection.style.display = 'block'; // Fixed display logic
    }
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick').includes(`'${sectionId}'`)) {
            link.classList.add('active');
        }
    });
    
    if (sectionId === 'menu') loadMenu();
    if (sectionId === 'orders') loadHistory();
    
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('active')) {
        toggleSidebar();
    }
}

async function loadMenu() {
    const grid = document.getElementById('menuGrid'); // Fixed ID
    grid.innerHTML = '<p>Loading yummy food...</p>';

    try {
        const backendURL = getBackendURL();
        const statusRes = await axios.get(`${backendURL}/api/menu/status`);
        const effectivelyOpen = statusRes.data.isOpen;

        let closedBanner = '';
        if (!effectivelyOpen) {
            closedBanner = `<div style="grid-column: 1/-1; background: #fee2e2; color: #b91c1c; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; margin-bottom: 20px;"><i class="fas fa-store-slash"></i> The Canteen is currently closed.</div>`;
        }

        const res = await api.getMenu();
        const menu = res.menu;
        let html = closedBanner;

        for (const [category, items] of Object.entries(menu)) {
            items.forEach(item => {
                const defaultImage = 'https://imgs.search.brave.com/eJrOBBqXjPdhO8ejCg9Vz4Tkubh4-rLONNGdACLq9vQ/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbHVz/LnVuc3BsYXNoLmNv/bS9wcmVtaXVtX3Zl/Y3Rvci0xNzEzMzY0/MzkzMDg1LTBmZGRh/MTNlYzdjZD9mbT1q/cGcmcT02MCZ3PTMw/MDAmaXhsaWI9cmIt/NC4xLjA';
                const imgSrc = item.image_url || defaultImage;
                const stockQty = item.available_quantity || 0;

                const stockDisplay = !effectivelyOpen
                    ? `<span style="color: #ef4444; font-size: 0.8rem; font-weight: 700;"><i class="fas fa-lock"></i> Closed</span>`
                    : (stockQty > 0
                        ? `<span style="color: #10b981; font-size: 0.8rem; font-weight: 700;"><i class="fas fa-box"></i> ${stockQty} Available</span>`
                        : `<span style="color: #ef4444; font-size: 0.8rem; font-weight: 700;"><i class="fas fa-times-circle"></i> Sold Out</span>`);

                const buttonHtml = (stockQty > 0 && effectivelyOpen)
                    ? `<button class="btn" onclick="addToCart('${item._id}', '${item.dish_name}', ${item.price}, ${stockQty})">Add +</button>`
                    : `<button class="btn" style="background: var(--border); color: var(--text-gray); cursor: not-allowed;" disabled>${!effectivelyOpen ? 'Closed' : 'Empty'}</button>`;

                html += `
                <div class="card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="font-size:0.75rem; color:var(--primary); font-weight:700; text-transform:uppercase;">
                            ${category}
                        </span>
                        ${stockDisplay} 
                    </div>
                    
                    <div class="food-img-container">
                        <img src="${imgSrc}" alt="${item.dish_name}" class="food-img">
                    </div>

                    <h3 style="margin: 15px 0 5px 0;">${item.dish_name}</h3>
                    <p style="font-size:0.9rem; color:var(--text-gray); min-height: 40px;">
                        ${item.description || ''}
                    </p>
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem;">
                        <span style="font-weight:800; font-size:1.3rem; color:var(--text-dark);">₹${item.price}</span>
                        ${buttonHtml} 
                    </div>
                </div>`;
            });
        }
        grid.innerHTML = html || '<p>No items available today.</p>';
        
        // After loading, run current filters to make sure UI is accurate
        filterStudentMenu(); 
    } catch (err) {
        grid.innerHTML = '<p>Error loading menu.</p>';
        console.error("Menu Load Error:", err);
    }
}

function addToCart(id, name, price, maxStock) {
    const existing = cart.find(i => i.id === id);
    const currentQty = existing ? existing.qty : 0;

    if (currentQty >= maxStock) {
        showToast(`Sorry, only ${maxStock} ${name} available!`, "error");
        return;
    }

    if (existing) {
        existing.qty++;
    } else {
        cart.push({ id, dish_name: name, price, qty: 1 });
    }

    updateCartUI();
    showToast(`${name} added to cart!`, "success");
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cartCount').innerText = count;
}

function viewCart() {
    if (cart.length === 0) {
        return showToast("Your cart is empty!", "error");
    }

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    sessionStorage.setItem('pendingOrder', JSON.stringify({
        items: cart,
        total: total
    }));
    window.location.href = 'payment.html';
}

async function placeOrder() {
    try {
        const orderData = {
            items: cart.map(i => ({
                dish_name: i.dish_name,
                quantity: i.qty,
                price: i.price
            }))
        };
        await api.placeOrder(orderData);
        alert("Order Placed Successfully!");
        cart = [];
        updateCartUI();
        showSection('orders');
    } catch (err) {
        alert("Order failed. Please check your connection.");
    }
}

async function loadHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '<p>Loading orders...</p>';
    try {
        const res = await api.getMyOrders();
        const orders = res.orders;

        if (orders.length === 0) {
            list.innerHTML = '<p>No orders found.</p>';
            return;
        }

        list.innerHTML = orders.map(order => {
            let qrBtnHtml = '';
            if (order.payment_status === 'paid' && order.order_status === 'pending') {
                const encodedData = encodeURIComponent(order.qr_code_data || '');
                qrBtnHtml = `
                    <button class="btn" style="margin-top: 10px; padding: 5px 12px; font-size: 0.8rem;" 
                            onclick="openQrModal('${encodedData}')">
                        <i class="fas fa-qrcode"></i> View QR
                    </button>
                `;
            }

            return `
            <div style="border-bottom:1px solid var(--border); padding: 15px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap;">
                <div>
                    <strong>Order #${order.order_id || 'N/A'}</strong>
                    <p style="font-size:0.85rem; color:var(--text-gray);">₹${order.total_amount} | ${new Date(order.order_date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                    ${qrBtnHtml}
                </div>
                <div style="text-align: right;">
                    <span style="background:var(--primary-light); color:var(--primary); padding:5px 12px; border-radius:20px; font-size:0.75rem; font-weight:700; text-transform:uppercase;">
                        ${order.order_status}
                    </span>
                    <p style="font-size: 0.75rem; margin-top: 5px; color: ${order.payment_status === 'paid' ? 'green' : 'orange'};">
                        Payment: ${order.payment_status}
                    </p>
                </div>
            </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Order History Error:", err);
        list.innerHTML = '<p>Error loading orders.</p>';
    }
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'login.html';
}

function openQrModal(encodedQrData) {
    if (!encodedQrData || encodedQrData === 'undefined') {
        alert("QR Code is still generating or missing.");
        return;
    }
    const rawData = decodeURIComponent(encodedQrData);
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(rawData)}`;
    document.getElementById('modalQrImage').src = qrImageUrl;
    document.getElementById('qrModal').style.display = 'block';
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) return;

    container.style.cssText = `
        position: fixed; 
        bottom: 30px; 
        left: 50%; 
        transform: translateX(-50%); 
        z-index: 9999; 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
        gap: 10px;
        pointer-events: none;
    `;

    const toast = document.createElement('div');
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';

    toast.innerHTML = `<i class="fas ${icon}" style="font-size: 1.2rem;"></i> <span style="margin-left: 10px; white-space: nowrap;">${message}</span>`;

    toast.style.cssText = `
        background-color: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: #ffffff; 
        padding: 14px 24px; 
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
        display: flex; 
        align-items: center; 
        font-size: 1rem;
        font-weight: 500;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease-out;
    `;

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
//  LIVE SEARCH FILTER 
// ==========================================
function filterStudentMenu() {
    const searchInput = document.getElementById('studentMenuSearch');
    if (!searchInput) return; 
    
    const query = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll('#menuGrid .card'); // Fixed ID
    
    // Reset category pills to "All" when typing
    const allPills = document.querySelectorAll('.filter-pill');
    allPills.forEach(pill => pill.classList.remove('active'));
    if(allPills[0]) allPills[0].classList.add('active'); 

    cards.forEach(card => {
        const dishNameTag = card.querySelector('h3');
        if (!dishNameTag) return; 
        
        const dishName = dishNameTag.textContent.toLowerCase();
        card.style.display = dishName.includes(query) ? 'block' : 'none';
    });
}

// ==========================================
//  CATEGORY PILL FILTER
// ==========================================
function filterByCategory(categoryName, clickedButton) {
    const allPills = document.querySelectorAll('.filter-pill');
    allPills.forEach(pill => pill.classList.remove('active'));
    if (clickedButton) clickedButton.classList.add('active');

    const searchInput = document.getElementById('studentMenuSearch');
    if (searchInput) searchInput.value = ''; 

    const cards = document.querySelectorAll('#menuGrid .card'); // Fixed ID
    cards.forEach(card => {
        const categorySpan = card.querySelector('span[style*="uppercase"]');
        if (!categorySpan) return; 
        
        const cardCategory = categorySpan.textContent.trim().toLowerCase();
        
        if (categoryName === 'all' || cardCategory === categoryName) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}