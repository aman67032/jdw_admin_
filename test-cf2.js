require('dotenv').config();
const axios = require('axios');

async function check() {
    try {
        const orderId = "CFPay_passes_a885fc5e_rty3c632fe7_1772737770522";
        const apiUrl = `https://sandbox.cashfree.com/pg/payment-links/${orderId}`; // Or prod

        console.log("Checking form data...");
        // This is a test to see if we can get the form data
    } catch (err) {
        console.error(err);
    }
}
check();
