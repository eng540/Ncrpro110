import React, { useState, useEffect } from 'react';

const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    // التقاط حدث beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowButton(true); // أظهر الزر لأن التثبيت التلقائي متاح
    };

    // عند التثبيت الناجح
    const installedHandler = () => {
      setIsInstalled(true);
      setShowButton(false);
    };

    // التحقق مما إذا كان التطبيق يعمل فعلاً في وضع standalone (مثبّت)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    // إذا لم يظهر beforeinstallprompt بعد 3 ثوان، نظهر الزر كخيار يدوي
    const timer = setTimeout(() => {
      if (!deferredPrompt && !isInstalled) {
        setShowButton(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      clearTimeout(timer);
    };
  }, []);

  if (!showButton || isInstalled) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      // الطريقة الرسمية
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response: ${outcome}`);
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setShowButton(false);
      }
    } else {
      // خطة بديلة: توجيه المستخدم لإضافة الموقع للشاشة الرئيسية
      alert(
        'لا يمكن التثبيت التلقائي حالياً.\n\n' +
        'لتثبيت التطبيق يدوياً:\n' +
        '1. اضغط على أيقونة القائمة (⋮) في شريط العنوان.\n' +
        '2. اختر "إضافة إلى الشاشة الرئيسية" أو "تثبيت التطبيق".\n\n' +
        'بعد التثبيت سيعمل التطبيق بملء الشاشة وبدون إنترنت.'
      );
    }
  };

  return (
    <button
      onClick={handleInstall}
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