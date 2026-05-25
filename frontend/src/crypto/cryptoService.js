/**
 * cryptoService.js
 * 
 * End-to-End Encryption Layer for NRC Latrine Tracker
 * 
 * Uses Web Crypto API ONLY — no external dependencies
 * Key Derivation: PBKDF2-SHA256 (500k iterations)
 * Encryption: AES-GCM-256
 * PIN: Independent PBKDF2 layer (100k iterations)
 * 
 * Master key is NEVER persisted — memory only
 */

import { Envelope, canonicalAAD } from './envelope.js';
import { db, getSetting, setSetting, updateChainHead, getChainHead } from '../db/index.js';

// ==========================================
// CONSTANTS
// ==========================================
const SEED_PBKDF2_ITERATIONS = 500000;  // 500k for seed (high security)
const PIN_PBKDF2_ITERATIONS = 100000;     // 100k for PIN
const AUTO_LOCK_MS = 15 * 60 * 1000;      // 15 minutes

// ==========================================
// STATE (Memory-only — NEVER persisted)
// ==========================================
let _masterKey = null;        // CryptoKey (AES-GCM-256)
let _pinValid = false;        // PIN session state
let _pinAttempts = 0;         // Failed PIN attempts
let _autoLockTimer = null;    // Inactivity timer

// ==========================================
// PRIVATE: PBKDF2 Key Derivation
// ==========================================

async function _deriveKeyFromPassword(password, salt, iterations, keyLen = 32) {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    keyLen * 8
  );

  return new Uint8Array(derivedBits);
}

async function _importAESKey(rawKey) {
  return await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false, // NOT extractable
    ['encrypt', 'decrypt']
  );
}

// ==========================================
// PRIVATE: Auto-lock
// ==========================================

function _resetAutoLock() {
  if (_autoLockTimer) {
    clearTimeout(_autoLockTimer);
  }
  _autoLockTimer = setTimeout(() => {
    _lockAll();
  }, AUTO_LOCK_MS);
}

function _lockAll() {
  _masterKey = null;
  _pinValid = false;
  _pinAttempts = 0;
  if (_autoLockTimer) {
    clearTimeout(_autoLockTimer);
    _autoLockTimer = null;
  }
  window.dispatchEvent(new CustomEvent('crypto-lock', { detail: { reason: 'auto' } }));
}

// ==========================================
// PRIVATE: Test vector verification
// ==========================================

async function _createTestVector(key) {
  const testPlaintext = new TextEncoder().encode('NRC-LATRINE-TEST-VECTOR-v2');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    testPlaintext
  );
  return { iv, ct: new Uint8Array(ciphertext) };
}

async function _verifyTestVector(key, storedVector) {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: storedVector.iv },
      key,
      storedVector.ct
    );
    const decoded = new TextDecoder().decode(plaintext);
    return decoded === 'NRC-LATRINE-TEST-VECTOR-v2';
  } catch {
    return false;
  }
}

// ==========================================
// PUBLIC API: Seed Vault
// ==========================================

class CryptoService {
  // ─── State Queries ───

  isLocked() {
    return _masterKey === null;
  }

  isPinValid() {
    return _pinValid && !this.isLocked();
  }

  // ─── Seed Creation / Unlock ───

  async unlockSeed(password) {
    if (!password || password.length < 10) {
      throw new Error('Password must be at least 10 characters');
    }

    const existingSalt = await getSetting('seed_salt');

    if (existingSalt) {
      // === UNLOCK MODE ===
      const salt = base64ToUint8(existingSalt);

      // Derive key using PBKDF2
      const derivedKey = await _deriveKeyFromPassword(
        password, 
        salt, 
        SEED_PBKDF2_ITERATIONS
      );

      // Import as AES key
      const key = await _importAESKey(derivedKey);

      // Verify with test vector
      const storedVector = await getSetting('seed_test_vector');
      if (!storedVector) {
        throw new Error('Corrupted vault: test vector missing');
      }

      const vector = JSON.parse(storedVector);
      const valid = await _verifyTestVector(key, {
        iv: base64ToUint8(vector.iv),
        ct: base64ToUint8(vector.ct),
      });

      if (!valid) {
        throw new Error('Invalid password');
      }

      _masterKey = key;
      return true;

    } else {
      // === CREATE MODE ===
      const salt = crypto.getRandomValues(new Uint8Array(16));

      // Derive key
      const derivedKey = await _deriveKeyFromPassword(
        password,
        salt,
        SEED_PBKDF2_ITERATIONS
      );

      const key = await _importAESKey(derivedKey);

      // Create test vector
      const vector = await _createTestVector(key);
      const vectorStore = {
        iv: uint8ToBase64(vector.iv),
        ct: uint8ToBase64(vector.ct),
      };

      // Persist salt and test vector (non-secret metadata)
      await setSetting('seed_salt', uint8ToBase64(salt));
      await setSetting('seed_test_vector', JSON.stringify(vectorStore));
      await setSetting('vault_created_at', new Date().toISOString());
      await setSetting('vault_version', '2.0'); // Mark as v2 (PBKDF2, not Argon2)

      _masterKey = key;
      return true;
    }
  }

  // ─── PIN Management ───

  async setPin(pin) {
    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be exactly 6 digits');
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await _deriveKeyFromPassword(pin, salt, PIN_PBKDF2_ITERATIONS, 32);

    await setSetting('pin_salt', uint8ToBase64(salt));
    await setSetting('pin_hash', uint8ToBase64(hash));
    await setSetting('pin_set_at', new Date().toISOString());

    _pinValid = true;
    _pinAttempts = 0;
    _resetAutoLock();
    return true;
  }

  async verifyPin(pin) {
    if (!pin || pin.length !== 6) {
      _pinAttempts++;
      return false;
    }

    const saltB64 = await getSetting('pin_salt');
    const hashB64 = await getSetting('pin_hash');

    // No PIN set yet — accept and set this as the PIN
    if (!saltB64 || !hashB64) {
      await this.setPin(pin);
      _pinValid = true;
      _pinAttempts = 0;
      _resetAutoLock();
      return true;
    }

    const salt = base64ToUint8(saltB64);
    const storedHash = base64ToUint8(hashB64);
    const computedHash = await _deriveKeyFromPassword(pin, salt, PIN_PBKDF2_ITERATIONS, 32);

    const valid = timingSafeEqual(storedHash, computedHash);

    if (valid) {
      _pinValid = true;
      _pinAttempts = 0;
      _resetAutoLock();
      return true;
    } else {
      _pinAttempts++;
      if (_pinAttempts >= 5) {
        this.lock();
      }
      return false;
    }
  }

  // ─── Lock ───

  lock() {
    _lockAll();
  }

  _startAutoLock() {
    _resetAutoLock();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        _resetAutoLock();
      }
    });
  }

  // ─── Encryption ───

  async encryptField(plaintext, meta) {
    if (this.isLocked()) {
      throw new Error('SEED_LOCKED: Cannot encrypt without unlocked seed');
    }

    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      _masterKey,
      plaintextBytes
    );

    const aad = canonicalAAD(meta.entity, meta.rid);
    const prevChainHash = await getChainHead(meta.entity);

    const envelope = await Envelope.create(
      iv,
      new Uint8Array(ciphertext),
      aad,
      {
        e: meta.entity,
        f: meta.field,
        r: meta.rid,
      },
      prevChainHash
    );

    await updateChainHead(meta.entity, envelope.int.c);

    return envelope.toDB();
  }

  async decryptField(envelopeRecord) {
    if (this.isLocked()) {
      throw new Error('SEED_LOCKED: Cannot decrypt without unlocked seed');
    }

    if (!envelopeRecord || !envelopeRecord._env) {
      throw new Error('Invalid envelope: missing _env');
    }

    const envelope = Envelope.fromDB(envelopeRecord);

    // Verify integrity before decryption
    const valid = await envelope.verify();
    if (!valid) {
      throw new Error('INTEGRITY_FAIL: Envelope hash mismatch');
    }

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: envelope.iv },
      _masterKey,
      envelope.ct
    );

    return new TextDecoder().decode(plaintext);
  }
}

// ==========================================
// UTILITIES
// ==========================================

function uint8ToBase64(uint8) {
  return btoa(String.fromCharCode(...uint8));
}

function base64ToUint8(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

export const cryptoService = new CryptoService();

// Auto-lock on tab close
window.addEventListener('beforeunload', () => {
  cryptoService.lock();
});
