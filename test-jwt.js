const jwt = require("jsonwebtoken");
try {
  const token = jwt.sign({ id: "admin" }, process.env.JWT_SECRET, { expiresIn: "24h" });
  console.log("SUCCESS:", token);
} catch (e) {
  console.log("ERROR:", e.message);
}
