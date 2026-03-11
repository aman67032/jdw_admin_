const express = require("express");
const router = express.Router();
const axios = require("axios");
const multer = require("multer");
const Payment = require("../models/Payment");

// Configure multer to store files in memory as Buffers
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Link ID to passType mapping
const LINK_MAP = {
    passes: "day_pass",
    "open-studio-pass": "open_studio",
    "all-access-pass": "all_access",
};

const PASS_TYPE_TO_LINK = {
    day_pass: "passes",
    open_studio: "open-studio-pass",
    all_access: "all-access-pass",
};

// Helper: Cashfree API headers
function getCashfreeHeaders() {
    return {
        "x-client-id": process.env.CASHFREE_APP_ID,
        "x-client-secret": process.env.CASHFREE_SECRET_KEY,
        "x-api-version": "2025-01-01",
        "Content-Type": "application/json",
    };
}

// ─── GET /api/payments/stats/summary ───
// Returns aggregate stats for all pass types
router.get("/stats/summary", async (req, res) => {
    try {
        const pipeline = [
            { $match: { status: "PAID" } },
            {
                $group: {
                    _id: "$passType",
                    totalRevenue: { $sum: "$amount" },
                    totalOrders: { $sum: 1 },
                },
            },
        ];

        const stats = await Payment.aggregate(pipeline);

        const allPayments = await Payment.countDocuments();
        const paidPayments = await Payment.countDocuments({ status: "PAID" });

        const summary = {
            totalOrders: allPayments,
            totalPaid: paidPayments,
            totalRevenue: stats.reduce((sum, s) => sum + s.totalRevenue, 0),
            byPassType: {
                day_pass: { totalOrders: 0, totalRevenue: 0 },
                open_studio: { totalOrders: 0, totalRevenue: 0 },
                all_access: { totalOrders: 0, totalRevenue: 0 },
            },
        };

        stats.forEach((s) => {
            if (summary.byPassType[s._id]) {
                summary.byPassType[s._id] = {
                    totalOrders: s.totalOrders,
                    totalRevenue: s.totalRevenue,
                };
            }
        });

        res.json({ success: true, data: summary });
    } catch (error) {
        console.error("Error fetching stats:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── GET /api/payments/sync/:passType ───
// For Payment Forms, data comes via webhooks — not a list API.
// This endpoint refreshes the status of existing orders from Cashfree
// and returns guidance on webhook setup.
router.get("/sync/:passType", async (req, res) => {
    try {
        const { passType } = req.params;
        const linkId = PASS_TYPE_TO_LINK[passType];

        if (!linkId) {
            return res
                .status(400)
                .json({ success: false, error: "Invalid pass type" });
        }

        // Refresh status of existing orders from Cashfree Orders API
        const existingOrders = await Payment.find({ passType }).lean();
        let updated = 0;

        for (const order of existingOrders) {
            try {
                const apiUrl = `${process.env.CASHFREE_API_URL}/orders/${order.orderId}`;
                const response = await axios.get(apiUrl, {
                    headers: getCashfreeHeaders(),
                });

                const freshOrder = response.data;
                const customerDetails = freshOrder.customer_details || {};

                await Payment.findOneAndUpdate(
                    { orderId: order.orderId },
                    {
                        status: freshOrder.order_status || order.status,
                        customerName: customerDetails.customer_name || order.customerName,
                        customerEmail: customerDetails.customer_email || order.customerEmail,
                        customerPhone: customerDetails.customer_phone || order.customerPhone,
                        amount: freshOrder.order_amount || order.amount,
                        rawData: freshOrder,
                    }
                );
                updated++;
            } catch (err) {
                // Skip individual order errors (e.g., order not found on Cashfree)
                console.log(`Could not refresh order ${order.orderId}: ${err.response?.data?.message || err.message}`);
            }
        }

        res.json({
            success: true,
            message: `Refreshed ${updated} of ${existingOrders.length} orders for ${passType}`,
            count: updated,
            total: existingOrders.length,
            hint: existingOrders.length === 0
                ? "No orders yet. Payment data arrives via Cashfree webhooks. Make sure your webhook URL is configured in the Cashfree dashboard: POST /api/webhook/cashfree"
                : undefined,
        });
    } catch (error) {
        console.error("Sync error:", error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


// ─── POST /api/payments/school-registration ───
// Direct registration via coupon with file upload
router.post("/school-registration", upload.single("invoice"), async (req, res) => {
    try {
        const { customerName, customerEmail, customerPhone, couponCode, customFields } = req.body;

        let parsedCustomFields = {};
        if (customFields) {
            try {
                parsedCustomFields = JSON.parse(customFields);
            } catch (e) {
                console.error("Error parsing customFields", e);
            }
        }

        const isCouponValid = couponCode === "MAX26";

        // Validate requirements based on coupon
        if (!isCouponValid && !req.file) {
            return res.status(400).json({ success: false, error: "Invoice file upload is required if no valid coupon is provided." });
        }

        const paymentData = {
            orderId: `school_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            linkId: "schooljdw",
            passType: "school_pass",
            customerName: customerName || "",
            customerEmail: customerEmail || "",
            customerPhone: customerPhone || "",
            customFields: parsedCustomFields,
            amount: 0,
            currency: "INR",
            status: isCouponValid ? "PAID" : "PENDING", // Admins might need to verify uploaded invoices
            paymentMethod: isCouponValid ? "COUPON: MAX26" : "INVOICE_UPLOAD",
            paymentTime: new Date(),
            orderNote: isCouponValid ? "Registered via coupon MAX26." : "Registered via form with invoice upload.",
        };

        if (req.file) {
            paymentData.invoiceFile = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        const savedOrder = await Payment.create(paymentData);

        res.json({
            success: true,
            message: "Student registered successfully",
            data: { orderId: savedOrder.orderId }
        });

    } catch (error) {
        console.error("School registration error:", error.message);
        res.status(500).json({ success: false, error: "Failed to process registration" });
    }
});

// ─── GET /api/payments/invoice/:orderId ───
// Retrieve binary invoice file for an order
router.get("/invoice/:orderId", async (req, res) => {
    try {
        const { orderId } = req.params;
        const payment = await Payment.findOne({ orderId });

        if (!payment || !payment.invoiceFile || !payment.invoiceFile.data) {
            return res.status(404).json({ success: false, error: "Invoice not found or no file attached" });
        }

        res.set("Content-Type", payment.invoiceFile.contentType);
        // Important: set Content-Disposition to inline or attachment based on what you want
        res.set("Content-Disposition", `inline; filename="invoice_${orderId}"`);
        res.send(payment.invoiceFile.data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── POST /api/payments/import ───
// Manually imports a specific order ID from Cashfree
router.post("/import", async (req, res) => {
    try {
        const { orderId, passType } = req.body;

        if (!orderId || !passType) {
            return res.status(400).json({ success: false, error: "Missing orderId or passType" });
        }

        const apiUrl = `${process.env.CASHFREE_API_URL}/orders/${orderId}`;
        const response = await axios.get(apiUrl, {
            headers: getCashfreeHeaders(),
        });

        const order = response.data;
        const customerDetails = order.customer_details || {};

        // Extract custom fields if present
        const customFieldsArr = customerDetails.customer_fields || [];
        const customFieldsObj = {};

        // Dynamically map all custom fields from the form
        customFieldsArr.forEach(field => {
            if (field.title && field.value) {
                customFieldsObj[field.title] = field.value;
            }
        });

        const orderData = {
            orderId: order.order_id || order.cf_order_id,
            cfOrderId: order.cf_order_id,
            linkId: PASS_TYPE_TO_LINK[passType] || "",
            passType: passType,
            customerName: customerDetails.customer_name || "",
            customerEmail: customerDetails.customer_email || "",
            customerPhone: customerDetails.customer_phone || "",
            customFields: customFieldsObj,
            amount: order.order_amount || 0,
            currency: order.order_currency || "INR",
            status: order.order_status || "PENDING",
            orderNote: order.order_note || "",
            rawData: order,
        };

        const savedOrder = await Payment.findOneAndUpdate(
            { orderId: orderData.orderId },
            orderData,
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            message: `Successfully imported order ${orderId}`,
            data: savedOrder
        });
    } catch (error) {
        console.error("Manual import error:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || "Check if the Order ID is correct"
        });
    }
});

// ─── GET /api/payments/:passType ───
// Returns all payments for a given pass type with search & pagination
router.get("/:passType", async (req, res) => {
    try {
        const { passType } = req.params;
        const { search, page = 1, limit = 50, status } = req.query;

        // Custom validation check
        const allowedTypes = [...Object.keys(PASS_TYPE_TO_LINK), "school_pass"];

        if (!allowedTypes.includes(passType)) {
            return res
                .status(400)
                .json({ success: false, error: "Invalid pass type" });
        }

        const query = { passType };

        if (status) {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { customerName: { $regex: search, $options: "i" } },
                { customerEmail: { $regex: search, $options: "i" } },
                { orderId: { $regex: search, $options: "i" } },
                { customerPhone: { $regex: search, $options: "i" } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Payment.countDocuments(query);
        const payments = await Payment.find(query)
            .select("-invoiceFile.data")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        res.json({
            success: true,
            data: payments,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("Error fetching payments:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
