require('dotenv').config();
const axios = require('axios');

async function check() {
    try {
        const orderId = "CFPay_passes_a885fc5e_rty3c632fe7_1772737770522";
        const apiUrl = `${process.env.CASHFREE_API_URL}/orders/${orderId}`;
        const response = await axios.get(apiUrl, {
            headers: {
                "x-client-id": process.env.CASHFREE_APP_ID,
                "x-client-secret": process.env.CASHFREE_SECRET_KEY,
                "x-api-version": "2025-01-01",
                "Content-Type": "application/json",
            }
        });
        console.log(JSON.stringify(response.data.customer_details, null, 2));
    } catch (err) {
        console.error(err.response?.data || err.message);
    }
}
check();
