# دليل دمج نظام الحماية مع NRC Latrine Tracker

## نظرة عامة
تم إضافة طبقة حماية كاملة (End-to-End Encryption) للبيانات الحساسة في النظام الميداني.

## الملفات الجديدة

### 1. التشفير (Crypto Layer)
- `frontend/src/crypto/canonical.js` — Canonicalization & hashing
- `frontend/src/crypto/envelope.js` — Immutable envelope format
- `frontend/src/crypto/cryptoService.js` — Argon2id + AES-GCM + key lifecycle

### 2. التخزين الآمن (Secure Storage)
- `frontend/src/storage/secureStorage.js` — Encrypt-only write / Decrypt-only read

### 3. المزامنة الآمنة (Secure Sync)
- `frontend/src/sync/syncProtocol.js` — Deterministic batch protocol

### 4. قاعدة البيانات (Updated)
- `frontend/src/db/index.js` — Schema v2 with _env support

### 5. خدمات (Services)
- `frontend/src/services/auditService.js` — Tamper-evident audit logging

### 6. مكونات واجهة المستخدم (UI Components)
- `frontend/src/components/SeedLockScreen.js` — Seed password creation/unlock
- `frontend/src/components/PinGate.js` — PIN verification gate

### 7. محرك المزامنة (Updated)
- `frontend/src/syncEngine.js` — Uses syncProtocol + secureStorage

## التعديلات المطلوبة على App.js

```javascript
// App.js modifications needed:

import SeedLockScreen from './components/SeedLockScreen';
import PinGate from './components/PinGate';
import { cryptoService } from './crypto/cryptoService';

function App() {
  const [seedUnlocked, setSeedUnlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);

  // ... existing code ...

  if (!seedUnlocked) {
    return <SeedLockScreen onUnlock={() => setSeedUnlocked(true)} />;
  }

  return (
    <div>
      <PinGate 
        required={true} 
        actionLabel="الوصول للبيانات" 
        onSuccess={() => setPinRequired(false)} 
      />
      {/* ... rest of app ... */}
    </div>
  );
}
```

## التبعيات الجديدة

```bash
cd frontend
npm install argon2-browser@^1.18.0
```

## كيفية العمل

### إنشاء الخزنة (First Time)
1. المستخدم يدخل كلمة مرور (10+ أحرف)
2. النظام يُنشئ salt عشوائي
3. Argon2id(password, salt) → master key
4. يُنشئ PIN افتراضي (000000) — يجب تغييره

### فتح الخزنة (Daily Use)
1. إدخال كلمة مرور الخزنة
2. إشتقاق المفتاح الرئيسي
3. التحقق من test vector
4. فتح الوصول للبيانات

### التحقق من PIN
1. يظهر PinGate قبل العمليات الحساسة
2. PIN مستقل تماماً عن master key
3. صلاحية 30 دقيقة
4. 5 محاولات فاشلة = قفل كامل

### تشفير البيانات
- beneficiary_hh, gps_coordinates, site_engineer — مشفرة في latrines
- description, action_required — مشفرة في remarks
- sync_queue payloads — مشفرة بالكامل

### سلسلة التكامل (Integrity Chain)
- كل envelope يحتوي على hash تكامل + chain hash
- chain hash يربط السجل بالسجل السابق
- يمنع التلاعب حتى لو تم الوصول للـ IndexedDB

## ملاحظات أمنية

⚠️ **نسيان كلمة مرور الخزنة = فقدان البيانات نهائياً**
- لا يوجد backdoor
- لا يوجد استرداد
- Master key لا يُخزن أبداً

⚠️ **الـ PIN مستقل**
- لا يعتمد على master key
- PBKDF2 منفصل
- يمنع الوصول حتى لو تم فك تشفير IndexedDB

## الأوامر

```bash
# تثبيت التبعيات
cd frontend
npm install argon2-browser@^1.18.0

# بناء للإنتاج
npm run build

# اختبار التشفير
npm test -- --testPathPattern=crypto
```
