import React, { useState, useEffect } from 'react';

const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault(); // منع العرض التلقائي
      setDeferredPrompt(e); // تخزين الحدث
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (!deferredPrompt || isInstalled) return null;

  return (
    <button
      onClick={async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        setDeferredPrompt(null);
      }}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        padding: '12px 20px', background: '#1F4E78', color: 'white',
        border: 'none', borderRadius: '8px', fontWeight: 'bold',
        cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        fontSize: '16px'
      }}
    >
      📲 تثبيت التطبيق
    </button>
  );
};

export default InstallPWA;