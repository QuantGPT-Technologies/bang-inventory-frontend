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
  getWorkflow: (id: number) => api.get(`/batches/${id}/workflow`),
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
  // approve/quality-result are new actions with no legacy /steps/ equivalent -- always use /nodes/.
  decideApproval: (id: number, nodeKey: string, data: object) =>
    api.post(`/lots/${id}/nodes/${nodeKey}/approve`, data),
  submitQualityResult: (id: number, nodeKey: string, data: object) =>
    api.post(`/lots/${id}/nodes/${nodeKey}/quality-result`, data),
  // Full template graph (every node, visited or not) merged with this lot's runtime status per
  // node -- powers the read-only execution graph view. See LotWorkflowGraph in lib/types.ts.
  getGraph: (id: number) => api.get(`/lots/${id}/graph`),
};

// --- Workflow Templates ---
export const workflowTemplatesApi = {
  list: (params?: object) => api.get('/workflow-templates', { params }),
  // versionId is the version row's own id (?version= query param), not the version number.
  get: (id: number, versionId?: number) =>
    api.get(`/workflow-templates/${id}`, { params: versionId ? { version: versionId } : undefined }),
  create: (data: { name: string; description?: string; entity_type?: 'lot' | 'batch' }) =>
    api.post('/workflow-templates', data),
  createVersion: (id: number, cloneFromVersionId?: number) =>
    api.post(`/workflow-templates/${id}/versions`, { clone_from_version_id: cloneFromVersionId }),
  listVersions: (id: number, params?: object) =>
    api.get(`/workflow-templates/${id}/versions`, { params }),
  // versionNumber is the version NUMBER (1, 2, 3...) in the URL, not the version's database row id.
  saveGraph: (id: number, versionNumber: number, data: { nodes: object[]; edges: object[] }) =>
    api.put(`/workflow-templates/${id}/versions/${versionNumber}/graph`, data),
  publish: (id: number, versionNumber: number) =>
    api.post(`/workflow-templates/${id}/versions/${versionNumber}/publish`),
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
  rawMaterialUsage: (params?: object) =>
    api.get('/reports/raw-material-usage', { params }),
  stepUsage: (params?: object) =>
    api.get('/reports/step-usage', { params }),
  trends: (params?: object) =>
    api.get('/reports/trends', { params }),
  yieldSummary: (params?: object) =>
    api.get('/reports/yield-summary', { params }),
  stockLevels: (params?: object) =>
    api.get('/reports/stock-levels', { params }),
};

// The single "what needs attention right now" source -- backs the Home task queue and (later)
// dashboard/notification surfaces.
export const attentionApi = {
  list: () => api.get('/attention'),
};
