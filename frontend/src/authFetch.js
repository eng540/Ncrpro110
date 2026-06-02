// authFetch.js - Global fetch override to automatically add Bearer token
// Created: 2026-06-02

const originalFetch = window.fetch;

const getToken = () => localStorage.getItem('nrc_token');

window.fetch = async (url, options = {}) => {
  const token = getToken();
  // Determine if this is an API request that requires authentication
  const isApiRequest = typeof url === 'string' && url.includes('/api/') && !url.includes('/api/token');
  
  if (token && isApiRequest) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
    // Only set Content-Type if not FormData (to allow multipart)
    if (!(options.body instanceof FormData) && !options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  }
  
  try {
    const response = await originalFetch(url, options);
    // If 401 Unauthorized and not the login endpoint, clear session
    if (response.status === 401 && !url.includes('/api/token')) {
      localStorage.removeItem('nrc_token');
      localStorage.removeItem('nrc_user');
      window.dispatchEvent(new CustomEvent('auth:logout'));
      console.warn('Session expired. Redirecting to login.');
      // Optionally reload page to force login screen
      // window.location.reload();
    }
    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};

export const authFetch = window.fetch;