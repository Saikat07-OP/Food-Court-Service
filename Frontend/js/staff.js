let html5QrcodeScanner;
let currentScannedOrderId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Set the Staff Name tag in the top right
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        const userName = user.name || 'Member';
        document.getElementById('staffName').textContent = `Staff | ${userName}`;
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
        
        // 🔥 Grab the exact ORD ID your backend expects
        currentScannedOrderId = orderData.order_id;

        // Populate the UI
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
        console.error("Scanner failed to parse text:", decodedText);
        alert("Invalid QR Code Data! Please check the console.");
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
        
        const token = localStorage.getItem('token'); 
        
        await axios.patch(`${backendURL}/api/staff/${currentScannedOrderId}/serve`, 
            {}, 
            {
                headers: {
                    'Authorization': `Bearer ${token}` 
                }
            }
        );

        alert("Order completed! Food has been served.");

        // Reset UI for the next student
        document.getElementById('orderVerifyCard').style.display = 'none';
        document.getElementById('reader').style.display = 'block';
        currentScannedOrderId = null;
        
        btn.innerHTML = '<i class="fas fa-bell"></i> Confirm Food Served';
        btn.disabled = false;
        
        startScanner();

    } catch (err) {
        console.error("Confirm Serve Error details:", err.response || err);
        const errorMsg = err.response?.data?.message || "Server Error! Could not update order status.";
        alert(errorMsg);
        
        btn.innerHTML = '<i class="fas fa-bell"></i> Confirm Food Served';
        btn.disabled = false;
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html'; 
}