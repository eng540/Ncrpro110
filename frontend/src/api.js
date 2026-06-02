// AUTH-PATCH 2026-06-02: مساعد موحد للطلبات مع إدارة الـ token وإعادة التوجيه عند انتهاء الصلاحية

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('nrc_token');
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  });
  
  if (res.status === 401) {
    localStorage.removeItem('nrc_token');
    localStorage.removeItem('nrc_user');
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error('Session expired. Please login again.');
  }
  
  return res;
};