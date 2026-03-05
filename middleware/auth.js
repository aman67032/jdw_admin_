const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, error: "Access denied. No authentication token provided." });
        }

        const token = authHeader.split(" ")[1];
        const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_local_dev_only";

        // Verify token
        const decoded = jwt.verify(token, jwtSecret);

        // Add user info to request (if needed later)
        req.user = decoded;

        // Move to the next middleware or route handler
        next();
    } catch (error) {
        console.error("JWT Verification Error:", error.message);
        return res.status(401).json({ success: false, error: "Invalid or expired token." });
    }
};

module.exports = authMiddleware;
