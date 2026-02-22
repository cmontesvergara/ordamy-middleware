const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.join(__dirname, "../../.env") });

module.exports = {
    PORT: process.env.PORT || 4300,
    SSO_BACKEND_URL: process.env.SSO_BACKEND_URL || "http://localhost:3000",
    FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:4200",
    APP_ID: process.env.APP_ID || "ordamy",
    COOKIE_NAME: process.env.COOKIE_NAME || "ordamy_session",
    NODE_ENV: process.env.NODE_ENV || "development",
    DATABASE_URL: process.env.DATABASE_URL,
};
