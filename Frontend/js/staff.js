let html5QrcodeScanner;
let currentScannedOrderId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Show correct User Role and Name
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        const userRole = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Staff';
        const userName = user.name || 'Member';
        document.getElementById('staffName').textContent = `${userRole} | ${userName}`;
    }
    showSection('scan');
    startScanner();
});

function showSection(sectionId) {
    document.getElementById('scanSection').style.display = sectionId === 'scan' ? 'block' : 'none';
    document.getElementById('ordersSection').style.display = sectionId === 'orders' ? 'block' : 'none';

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick').includes(`'${sectionId}'`)) {
            link.classList.add('active');
        }
    });
}

function startScanner() {
    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader", 
            { fps: 10, qrbox: { width: 250, height: 250 } }
        );
    }
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function onScanSuccess(decodedText, decodedResult) {
    // Pause scanner
    html5QrcodeScanner.clear();
    document.getElementById('reader').style.display = 'none';

    try {
        const orderData = JSON.parse(decodedText);
        currentScannedOrderId = orderData.order_id;

        // Populate the Modern UI
        document.getElementById('dispOrderId').innerText = orderData.order_id || "N/A";
        document.getElementById('dispName').innerText = orderData.payer_name || "Student";

        let itemsHtml = orderData.items.map(item => `
            <li>
                <span><span class="food-qty">${item.qty}x</span> ${item.dish}</span>
            </li>
        `).join('');
        document.getElementById('dispItems').innerHTML = itemsHtml;

        // Show verification card
        document.getElementById('orderVerifyCard').style.display = 'block';

    } catch (err) {
        console.error("🔥 SCANNER FAILED TO PARSE JSON!");
        console.error("The exact text the camera read was: ", decodedText);
        alert("Invalid QR Code Data! Please check the console (F12) to see what text it found.");
        
        document.getElementById('reader').style.display = 'block';
        startScanner();
    }
}

function onScanFailure(error) { 
    // Ignore routine camera errors
}

async function confirmServe() {
    if (!currentScannedOrderId) return;

    const btn = document.querySelector('.btn-confirm');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        const backendURL = 'https://food-court-service-backend.onrender.com';
        
        await axios.patch(`${backendURL}/api/orders/${currentScannedOrderId}/status`, {
            order_status: 'served'
        });

        alert("Order completed! Food has been served.");

        document.getElementById('orderVerifyCard').style.display = 'none';
        document.getElementById('reader').style.display = 'block';
        currentScannedOrderId = null;
        
        btn.innerHTML = '<i class="fas fa-bell"></i> Confirm Food Served';
        btn.disabled = false;
        
        startScanner();

    } catch (err) {
        console.error("Confirm Serve Error:", err);
        alert("Server Error! Could not update order status.");
        btn.innerHTML = '<i class="fas fa-bell"></i> Confirm Food Served';
        btn.disabled = false;
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html'; 
}