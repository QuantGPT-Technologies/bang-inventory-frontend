import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let sessionExpiredHandled = false;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const isAuthEndpoint = typeof err?.config?.url === 'string' && err.config.url.includes('/auth/login');

    if (status === 401 && !isAuthEndpoint && typeof window !== 'undefined') {
      if (!sessionExpiredHandled) {
        sessionExpiredHandled = true;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        const next = window.location.pathname + window.location.search;
        window.location.href = next && next !== '/login' ? `/login?next=${encodeURIComponent(next)}` : '/login';
      }
    }
    return Promise.reject(err);
  }
);

// --- Auth ---
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (old_password: string, new_password: string) =>
    api.put('/auth/password', { old_password, new_password }),
};

// --- Users ---
export const usersApi = {
  list: (page = 1, per_page = 20) =>
    api.get('/users', { params: { page, per_page } }),
  get: (id: number) => api.get(`/users/${id}`),
  create: (data: object) => api.post('/users', data),
  update: (id: number, data: object) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
};

// --- Customers ---
export const customersApi = {
  list: (page = 1, per_page = 50) =>
    api.get('/customers', { params: { page, per_page } }),
  get: (id: number) => api.get(`/customers/${id}`),
  create: (data: object) => api.post('/customers', data),
  update: (id: number, data: object) => api.put(`/customers/${id}`, data),
};

// --- Vendors ---
export const vendorsApi = {
  list: (page = 1, per_page = 50) =>
    api.get('/vendors', { params: { page, per_page } }),
  get: (id: number) => api.get(`/vendors/${id}`),
  create: (data: object) => api.post('/vendors', data),
  update: (id: number, data: object) => api.put(`/vendors/${id}`, data),
};

// --- SKUs ---
export const skusApi = {
  list: (page = 1, per_page = 50) =>
    api.get('/skus', { params: { page, per_page } }),
  get: (id: number) => api.get(`/skus/${id}`),
  create: (data: object) => api.post('/skus', data),
  update: (id: number, data: object) => api.put(`/skus/${id}`, data),
  setMaterials: (id: number, materials: object[]) =>
    api.put(`/skus/${id}/materials`, { materials }),
};

// --- Raw Materials ---
export const rawMaterialsApi = {
  list: (page = 1, per_page = 50) =>
    api.get('/raw-materials', { params: { page, per_page } }),
  get: (id: number) => api.get(`/raw-materials/${id}`),
  create: (data: object) => api.post('/raw-materials', data),
  update: (id: number, data: object) => api.put(`/raw-materials/${id}`, data),
  adjustStock: (id: number, data: object) =>
    api.post(`/raw-materials/${id}/stock`, data),
};

// --- Consumables ---
export const consumablesApi = {
  list: (page = 1, per_page = 50) =>
    api.get('/consumables', { params: { page, per_page } }),
  get: (id: number) => api.get(`/consumables/${id}`),
  create: (data: object) => api.post('/consumables', data),
  update: (id: number, data: object) => api.put(`/consumables/${id}`, data),
  adjustStock: (id: number, data: object) =>
    api.post(`/consumables/${id}/stock`, data),
};

// --- Batches ---
export const batchesApi = {
  list: (params?: object) => api.get('/batches', { params }),
  get: (id: number) => api.get(`/batches/${id}`),
  create: (data: object) => api.post('/batches', data),
  update: (id: number, data: object) => api.put(`/batches/${id}`, data),
  startBlend: (id: number) => api.post(`/batches/${id}/blend`),
  completeBlend: (id: number, data: object) =>
    api.post(`/batches/${id}/complete-blend`, data),
  splitLots: (id: number, lots: object[]) =>
    api.post(`/batches/${id}/lots`, { lots }),
};

// --- Lots ---
export const lotsApi = {
  list: (params?: object) => api.get('/lots', { params }),
  get: (id: number) => api.get(`/lots/${id}`),
  startStep: (id: number, step: string, data?: object) =>
    api.post(`/lots/${id}/steps/${step}/start`, data),
  completeStep: (id: number, step: string, data: object) =>
    api.post(`/lots/${id}/steps/${step}/complete`, data),
  updateStep: (id: number, step: string, data: object) =>
    api.put(`/lots/${id}/steps/${step}`, data),
  skipStep: (id: number, step: string) =>
    api.post(`/lots/${id}/steps/${step}/skip`),
  getAnalytics: (id: number, step: string) =>
    api.get(`/lots/${id}/steps/${step}/analytics`),
  recordScrap: (id: number, step: string, data: object) =>
    api.post(`/lots/${id}/steps/${step}/scrap`, data),
  recordConsumable: (id: number, step: string, data: object) =>
    api.post(`/lots/${id}/steps/${step}/consumables`, data),
};

// --- Webhooks ---
export const webhooksApi = {
  list: () => api.get('/webhooks'),
  get: (id: number) => api.get(`/webhooks/${id}`),
  create: (data: object) => api.post('/webhooks', data),
  update: (id: number, data: object) => api.put(`/webhooks/${id}`, data),
  delete: (id: number) => api.delete(`/webhooks/${id}`),
  test: (id: number) => api.post(`/webhooks/${id}/test`),
};

// --- Reports ---
export const reportsApi = {
  productionSummary: () => api.get('/reports/production-summary'),
  scrapSummary: (params?: object) =>
    api.get('/reports/scrap-summary', { params }),
  materialUsage: (params?: object) =>
    api.get('/reports/material-usage', { params }),
};
