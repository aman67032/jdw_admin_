const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Payment = require("../models/Payment");

// Link ID to passType mapping
const LINK_MAP = {
    passes: "day_pass",
    "open-studio-pass": "open_studio",
    "all-access-pass": "all_access",
};

// Verify Cashfree webhook signature
function verifyWebhookSignature(body, signature, timestamp) {
    try {
        const secretKey = process.env.CASHFREE_SECRET_KEY;
        const payload = timestamp + body;
        const expectedSignature = crypto
            .createHmac("sha256", secretKey)
            .update(payload)
            .digest("base64");
        return expectedSignature === signature;
    } catch (error) {
        console.error("Signature verification error:", error.message);
        return false;
    }
}

// ─── POST /api/webhook/cashfree ───
// Receives webhook events from Cashfree
router.post("/cashfree", express.raw({ type: "application/json" }), async (req, res) => {
    try {
        const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        const signature = req.headers["x-webhook-signature"];
        const timestamp = req.headers["x-webhook-timestamp"];

        // Log webhook receipt
        console.log("Webhook received:", {
            type: req.body?.type,
            timestamp,
            hasSignature: !!signature,
        });

        // Verify signature (log warning but don't block in dev)
        if (signature && timestamp) {
            const isValid = verifyWebhookSignature(rawBody, signature, timestamp);
            if (!isValid) {
                console.warn("⚠️  Webhook signature verification failed");
                // In production, you might want to reject:
                // return res.status(401).json({ error: "Invalid signature" });
            }
        }

        const payload = typeof req.body === "object" ? req.body : JSON.parse(rawBody);

        // Handle payment_form_order_webhook events
        if (payload.type === "payment_form_order_webhook" || payload.data) {
            const data = payload.data || {};
            const form = data.form || {};
            const order = data.order || {};
            const payment = data.payment || {};
            const customerDetails = order.customer_details || {};

            // Determine pass type from form URL or form_id
            const formUrl = form.form_url || "";
            let passType = "day_pass"; // default

            for (const [linkId, pType] of Object.entries(LINK_MAP)) {
                if (formUrl.includes(linkId) || form.form_id === linkId) {
                    passType = pType;
                    break;
                }
            }

            // Extract custom fields if present
            const customFieldsArr = customerDetails.customer_fields || [];
            const customFieldsObj = {};

            // Dynamically map all custom fields from the form
            customFieldsArr.forEach(field => {
                if (field.title && field.value) {
                    customFieldsObj[field.title] = field.value;
                }
            });

            const paymentData = {
                orderId: order.order_id || order.cf_order_id || `wh_${Date.now()}`,
                cfOrderId: order.cf_order_id || "",
                linkId: form.form_id || "",
                passType,
                customerName: customerDetails.customer_name || "",
                customerEmail: customerDetails.customer_email || "",
                customerPhone: customerDetails.customer_phone || "",
                customFields: customFieldsObj,
                amount: order.order_amount || payment.payment_amount || 0,
                currency: order.order_currency || form.form_currency || "INR",
                status: order.order_status || payment.payment_status || "PAID",
                paymentMethod: payment.payment_group || payment.payment_method?.toString() || "",
                paymentTime: payment.payment_time
                    ? new Date(payment.payment_time)
                    : new Date(),
                orderNote: order.order_note || "",
                rawData: payload,
            };

            await Payment.findOneAndUpdate(
                { orderId: paymentData.orderId },
                paymentData,
                { upsert: true, new: true }
            );

            console.log(
                `✅ Payment stored: ${paymentData.orderId} | ${passType} | ₹${paymentData.amount}`
            );
        }

        // Always return 200 to acknowledge receipt
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Webhook processing error:", error.message);
        // Still return 200 to prevent Cashfree retries
        res.status(200).json({ success: true, warning: "Processing error logged" });
    }
});

module.exports = router;
