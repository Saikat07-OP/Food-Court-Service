let cart = [];
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    document.getElementById('studentName').textContent = user.name;
    showSection('menu');
});
function showSection(sectionId) {
    const sections = ['menuSection', 'ordersSection', 'walletSection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const activeSection = document.getElementById(`${sectionId}Section`);
    if (activeSection) {
        activeSection.style.display = (sectionId === 'menu') ? 'grid' : 'block';
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
    if (sidebar.classList.contains('active')) {
        toggleSidebar();
    }
}
async function loadMenu() {
    const grid = document.getElementById('menuSection');
    grid.innerHTML = '<p>Loading yummy food...</p>';
    try {
        const res = await api.getMenu();
        const menu = res.menu;
        let html = '';

        for (const [category, items] of Object.entries(menu)) {
            items.forEach(item => {
                const defaultImage = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80';
                const imgSrc = item.image_url || defaultImage;

                html += `
                <div class="card">
                    <span style="font-size:0.75rem; color:var(--primary); font-weight:700; text-transform:uppercase; display:block; margin-bottom:10px;">
                        ${category}
                    </span>
                    
                    <div class="food-img-container">
                        <img src="${imgSrc}" alt="${item.dish_name}" class="food-img">
                    </div>

                    <h3 style="margin: 15px 0 5px 0;">${item.dish_name}</h3>
                    <p style="font-size:0.9rem; color:var(--text-gray); min-height: 40px;">
                        ${item.description || 'Tasty & Fresh'}
                    </p>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem;">
                        <span style="font-weight:800; font-size:1.3rem; color:var(--text-dark);">₹${item.price}</span>
                        <button class="btn" onclick="addToCart('${item._id}', '${item.dish_name}', ${item.price})">
                            Add +
                        </button>
                    </div>
                </div>`;
            });
        }
        grid.innerHTML = html || '<p>No items available today.</p>';
    } catch (err) {
        grid.innerHTML = '<p>Error loading menu.</p>';
        console.error("Menu Load Error:", err); // Helpful for debugging
    }
}
function addToCart(id, name, price) {
    const existing = cart.find(i => i.id === id);
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ id, dish_name: name, price, qty: 1 });
    }
    updateCartUI();
}
function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cartCount').innerText = count;
}
function viewCart() {
    if (cart.length === 0) return alert("Cart is empty!");
    let text = "Your Cart:\n";
    let total = 0;
    cart.forEach(item => {
        text += `${item.dish_name} x ${item.qty} = ₹${item.price * item.qty}\n`;
        total += item.price * item.qty;
    });
    if (confirm(`${text}\nTotal: ₹${total}\n\nPlace Order?`)) {
        placeOrder();
    }
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
            // 1. Prepare the QR Button (Empty by default)
            let qrBtnHtml = '';

            // 2. If Paid AND Pending (not served yet), show the button!
            if (order.payment_status === 'paid' && order.order_status === 'pending') {
                // We safely encode the text data so it doesn't break the HTML
                const encodedData = encodeURIComponent(order.qr_code_data || '');
                qrBtnHtml = `
                    <button class="btn" style="margin-top: 10px; padding: 5px 12px; font-size: 0.8rem;" 
                            onclick="openQrModal('${encodedData}')">
                        <i class="fas fa-qrcode"></i> View QR
                    </button>
                `;
            }

            // 3. Render the card
            return `
            <div style="border-bottom:1px solid var(--border); padding: 15px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap;">
                <div>
                    <strong>Order #${order.order_id || 'N/A'}</strong>
                    <p style="font-size:0.85rem; color:var(--text-gray);">₹${order.total_amount} | ${new Date(order.order_date).toLocaleDateString()}</p>
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
    localStorage.clear();
    window.location.href = 'login.html';
}

function viewCart() {
    if (cart.length === 0) return alert("Cart is empty!");
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    sessionStorage.setItem('pendingOrder', JSON.stringify({
        items: cart,
        total: total
    }));
    window.location.href = 'payment.html';
}
function openQrModal(encodedQrData) {
    if (!encodedQrData || encodedQrData === 'undefined') {
        alert("QR Code is still generating or missing.");
        return;
    }
    
    // Decode the data back to normal text
    const rawData = decodeURIComponent(encodedQrData);
    
    // Call the free QR generation API
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(rawData)}`;
    
    // Update the image source and show the modal box
    document.getElementById('modalQrImage').src = qrImageUrl;
    document.getElementById('qrModal').style.display = 'block';
}