import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, "../../.env") });

export const PORT = process.env.PORT || 4300;
export const SSO_BACKEND_URL = process.env.SSO_BACKEND_URL || "http://localhost:3000";
export const SSO_JWKS_URL = process.env.SSO_JWKS_URL || `${process.env.SSO_BACKEND_URL || "http://localhost:3000"}/.well-known/jwks.json`;
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";
export const APP_ID = process.env.APP_ID || "ordamy";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const DATABASE_URL = process.env.DATABASE_URL;

// Cookie configuration for refresh token
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ".bigso.co";
export const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "strict";
