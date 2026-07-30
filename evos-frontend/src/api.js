import axios from "axios";
import { PRIMARY_BASE, FALLBACK_BASE } from "./config";

// =========================
// BASE CONFIG (primary + fallback)
// =========================
const baseHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const primaryClient = axios.create({
  baseURL: PRIMARY_BASE,
  timeout: 60000,
  headers: baseHeaders,
});

const fallbackClient = axios.create({
  baseURL: FALLBACK_BASE,
  timeout: 60000,
  headers: baseHeaders,
});

// =========================
// DEBUG INTERCEPTOR (both clients)
// =========================
const logError = (label) => (err) => {
  console.error(`🔥 API ERROR [${label}]:`, {
    url: err.config?.url,
    status: err.response?.status,
    data: err.response?.data,
    message: err.message,
  });
  return Promise.reject(err);
};
primaryClient.interceptors.response.use((res) => res, logError("primary"));
fallbackClient.interceptors.response.use((res) => res, logError("fallback"));

// =========================
// FAILOVER WRAPPER
// =========================
// Only retries on fallback if the primary never answered at all
// (timeout / DNS / connection refused). A real HTTP error response
// (4xx/5xx) from the primary is returned as-is, not retried.
async function request(method, url, data, config = {}) {
  try {
    return await primaryClient[method](url, ...(data !== undefined ? [data, config] : [config]));
  } catch (err) {
    if (err.response) throw err; // primary answered, just with an error — trust it
    console.warn(`⚠️ ${PRIMARY_BASE} unreachable, retrying via ${FALLBACK_BASE}`, err.message);
    return fallbackClient[method](url, ...(data !== undefined ? [data, config] : [config]));
  }
}

// =========================
// AUTH
// =========================
export const registerUser = (data) =>
  request("post", "/auth/register", {
    username: data.username?.trim().toLowerCase(),
    full_name: data.full_name,
    email: data.email?.trim().toLowerCase(),
    phone: data.phone,
    password: data.password,
    referred_by: data.referred_by || null,
  });

export const loginUser = (data) =>
  request("post", "/auth/login", {
    username: data.username?.trim().toLowerCase(),
    password: data.password,
  });

// =========================
// PRICES
// =========================
export const getPrices = () => request("get", "/prices");

// =========================
// ORDERS
// =========================
export const createOrder = (data) => request("post", "/orders/create", data);

export const getOrders = (user_id) => request("get", `/orders/me?user_id=${user_id}`);

// =========================
// VERIFY NUMBER (MTN pre-check, informational only)
// Backend's own DataMart call can take up to ~9s worst case (see main.py),
// so this needs real margin above that or we time out on the frontend
// while the backend is still legitimately waiting on a real answer.
// =========================
export const verifyNumber = (phoneNumber, network, timeout = 12000) =>
  request("post", "/verify-number", { phoneNumber, network }, { timeout });

export default primaryClient;
