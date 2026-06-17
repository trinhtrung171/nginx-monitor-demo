import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './AuthContext'
import { initClientIp, getIp } from './clientIp'
import App from './App'
import './index.css'

// Detect real client IP and include it in all API calls
initClientIp();
{
  const originalFetch = window.fetch;
  window.fetch = (input, init = {}) => {
    const ip = getIp();
    if (ip) {
      init.headers = { ...init.headers, 'x-client-ip': ip };
    }
    return originalFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
