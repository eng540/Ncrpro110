import React from 'react';
import ReactDOM from 'react-dom/client';
import './authFetch';   // IMPORTANT: overrides fetch globally
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

serviceWorkerRegistration.register();