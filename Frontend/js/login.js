document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const toggleBtn = document.querySelector('#togglePassword');
    const passwordInput = document.querySelector('#password');
    
    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            

            const icon = toggleBtn.querySelector('i');
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const collegeId = document.getElementById('collegeId').value.trim();
            const passwordValue = document.getElementById('password').value;
            const errorMsg = document.getElementById('errorMessage');


            errorMsg.style.display = 'none';

            try {
                const responseData = await api.login({
                    college_id: collegeId,
                    password: passwordValue
                });

                sessionStorage.setItem('token', responseData.token);
                sessionStorage.setItem('user', JSON.stringify(responseData.user));

                const userRole = responseData.user.role;
                if (userRole === 'admin') {
                    window.location.href = '../html/admin.html';
                } else if (userRole === 'staff') {
                    window.location.href = '../html/staff.html';
                } else {
                    window.location.href = '../html/student.html';
                }

            } catch (err) {
                errorMsg.style.display = 'block';
                errorMsg.innerText = err.response?.data?.message || "Login failed. Check your ID or Password.";
            }
        });
    }
});