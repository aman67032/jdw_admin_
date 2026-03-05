require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const paymentRoutes = require("./routes/payments");
const webhookRoutes = require("./routes/webhook");
const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/auth");

const app = express();

// ─── Middleware ───
app.use(
    cors({
        origin: [
            "http://localhost:3000",
            "http://localhost:3001",
            "https://jdw-admin.vercel.app",
            "https://jdw-admin-f0.vercel.app"
        ],
        credentials: true,
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global DB Connection for Serverless
let isConnected = false;
const connectDB = async () => {
    if (isConnected || mongoose.connection.readyState === 1) {
        isConnected = true;
        return;
    }
    try {
        console.log("Connecting to MongoDB...");
        const db = await mongoose.connect(process.env.MONGODB_URI);
        isConnected = db.connections[0].readyState === 1;
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ Failed to connect to MongoDB:", error.message);
    }
};

// Apply DB connection middleware to API routes
app.use("/api", async (req, res, next) => {
    await connectDB();
    next();
});

// ─── Routes ───
app.use("/api/auth", authRoutes); // Public Login Route
app.use("/api/payments", authMiddleware, paymentRoutes); // Protected Admin Routes
app.use("/api/webhook", webhookRoutes); // Public Webhook Route

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
});

// Start server if running locally, otherwise export for Vercel
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const PORT = process.env.PORT || 5000;
    connectDB().then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 JDW Backend running on http://localhost:${PORT}`);
        });
    });
}

module.exports = app;
