import axios from "axios";

// =========================
// BASE CONFIG
// =========================
const API = axios.create({
  baseURL: "https://api.evosdata.xyz",
  timeout: 60000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// =========================
// DEBUG INTERCEPTOR
// =========================
API.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error("🔥 API ERROR:", {
      url: err.config?.url,
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });
    return Promise.reject(err);
  }
);

// =========================
// AUTH
// =========================
export const registerUser = (data) =>
  API.post("/auth/register", {
    username: data.username?.trim().toLowerCase(),
    full_name: data.full_name,
    email: data.email?.trim().toLowerCase(),
    phone: data.phone,
    password: data.password,
    referred_by: data.referred_by || null,
  });

export const loginUser = (data) =>
  API.post("/auth/login", {
    username: data.username?.trim().toLowerCase(),
    password: data.password,
  });

// =========================
// PRICES
// =========================
export const getPrices = () => API.get("/prices");

// =========================
// ORDERS
// =========================
export const createOrder = (data) =>
  API.post("/orders/create", data);

export const getOrders = (user_id) =>
  API.get(`/orders/me?user_id=${user_id}`);

// =========================
// VERIFY NUMBER (MTN pre-check, informational only)
// =========================
export const verifyNumber = (phoneNumber, network, timeout = 8000) =>
  API.post("/verify-number", { phoneNumber, network }, { timeout });

export default API;
