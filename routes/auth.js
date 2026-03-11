const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

router.post("/login", (req, res) => {
    try {
        const { username, password } = req.body;

        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;
        const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_local_dev_only";

        if (!username || !password) {
            return res.status(400).json({ success: false, error: "Username and password are required" });
        }

        if (username === adminUsername && password === adminPassword) {
            // Generate JWT
            const token = jwt.sign(
                { id: "admin", role: "superuser" },
                jwtSecret,
                { expiresIn: "24h" }
            );

            return res.json({
                success: true,
                token: token,
                message: "Login successful"
            });
        }

        return res.status(401).json({ success: false, error: "Invalid credentials" });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// A route to verify token validity (useful for frontend to check if logged in on load)
router.get("/verify", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_local_dev_only";

    try {
        jwt.verify(token, jwtSecret);
        return res.json({ success: true, message: "Valid token" });
    } catch (error) {
        return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }
});

module.exports = router;
