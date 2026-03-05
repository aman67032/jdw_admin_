require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function check() {
    const orderId = "CFPay_passes_a885fc5e_rty3c632fe7_1772737770522";
    const txId = "5109515377";
    const paymentRequestId = "187710391";

    const headers = {
        "x-client-id": process.env.CASHFREE_APP_ID,
        "x-client-secret": process.env.CASHFREE_SECRET_KEY,
        "x-api-version": "2025-01-01",
        "Content-Type": "application/json",
    };

    const endpointsToTest = [
        `${process.env.CASHFREE_API_URL}/orders/${orderId}/payments`,
        `${process.env.CASHFREE_API_URL}/payment-links/${paymentRequestId}`,
        `${process.env.CASHFREE_API_URL}/payment-links/${paymentRequestId}/orders`,
        `${process.env.CASHFREE_API_URL}/forms/${paymentRequestId}`,
        `${process.env.CASHFREE_API_URL}/forms/${paymentRequestId}/orders`,
        `${process.env.CASHFREE_API_URL}/pg/forms/${paymentRequestId}/orders`,
        `https://api.cashfree.com/pg/payment-forms/orders?orderId=${orderId}`,
    ];

    let found = false;

    for (let url of endpointsToTest) {
        try {
            const response = await axios.get(url, { headers });
            const dataStr = JSON.stringify(response.data);

            if (dataStr.toLowerCase().includes("zoom") || dataStr.toLowerCase().includes("field") || dataStr.toLowerCase().includes("customer_fields")) {
                console.log(`\n✅ CUSTOM FIELDS FOUND AT: ${url}`);
                fs.writeFileSync("cf-data.json", JSON.stringify(response.data, null, 2));
                found = true;
                break;
            } else {
                console.log(`❌ No custom fields in: ${url}`);
            }
        } catch (err) {
            console.log(`Failed ${url}: ${err.response?.status} - ${err.response?.data?.message || err.message}`);
        }
    }

    if (!found) console.log("Could not find any endpoint that returns custom fields.");
}
check();
