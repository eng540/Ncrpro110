/**
 * cryptoService.js
 * 
 * End-to-End Encryption Layer for NRC Latrine Tracker
 * 
 * Features:
 * - Argon2id key derivation (t=3, m=65536, p=4)
 * - AES-GCM-256 encryption via Web Crypto API
 * - Independent PIN layer (PBKDF2, 100k iterations)
 * - Immutable envelope format with integrity + chain hashing
 * - Auto-lock after 15min inactivity
 * - Master key NEVER persisted (memory-only)
 */

import { Envelope, canonicalAAD } from './envelope.js';
import { db, getSetting, setSetting, updateChainHead, getChainHead } from '../db/index.js';

// ==========================================
// CONSTANTS
// ==========================================
const ARGON2_PARAMS = {
  type: 2, // Argon2id
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLen: 32,
};

const PIN_PBKDF2_ITERATIONS = 100000;
const PIN_HASH_LEN = 32;
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes
const SEED_KEY_PURPOSE = 'seed-master';
const PIN_KEY_PURPOSE = 'pin-verify';

// ==========================================
// STATE (Memory-only, never persisted)
// ==========================================
let _masterKey = null;        // CryptoKey (AES-GCM-256)
let _pinValid = false;        // PIN session state
let _pinAttempts = 0;         // Failed PIN attempts
let _autoLockTimer = null;    // Inactivity timer
let _seedSalt = null;         // Cached salt (non-secret)

// ==========================================
// PRIVATE: Argon2id via argon2-browser
// ==========================================

async function _deriveMasterKey(password, salt) {
  const { hash } = await window.argon2.hash({
    pass: password,
    salt: salt,
    ...ARGON2_PARAMS,
  });

  // hash is Uint8Array(32) — derive AES-256 key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['encrypt', 'decrypt']
  );

  return keyMaterial;
}

async function _generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return salt;
}

// ==========================================
// PRIVATE: PIN PBKDF2
// ==========================================

async function _hashPin(pin, salt) {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PIN_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PIN_HASH_LEN * 8
  );

  return new Uint8Array(hash);
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
  // Dispatch event for UI
  window.dispatchEvent(new CustomEvent('crypto-lock', { detail: { reason: 'auto' } }));
}

// ==========================================
// PRIVATE: Test vector verification
// ==========================================

async function _createTestVector(key) {
  const testPlaintext = new TextEncoder().encode('NRC-LATRINE-TEST-VECTOR');
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
    return decoded === 'NRC-LATRINE-TEST-VECTOR';
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

  // ─── Seed Creation ───

  async unlockSeed(password) {
    if (!password || password.length < 10) {
      throw new Error('Password must be at least 10 characters');
    }

    const existingSalt = await getSetting('seed_salt');

    if (existingSalt) {
      // Unlock mode: verify existing
      const salt = base64ToUint8(existingSalt);
      const key = await _deriveMasterKey(password, salt);

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
      _seedSalt = salt;
      return true;

    } else {
      // Create mode: new vault
      const salt = await _generateSalt();
      const key = await _deriveMasterKey(password, salt);

      const vector = await _createTestVector(key);
      const vectorStore = {
        iv: uint8ToBase64(vector.iv),
        ct: uint8ToBase64(vector.ct),
      };

      await setSetting('seed_salt', uint8ToBase64(salt));
      await setSetting('seed_test_vector', JSON.stringify(vectorStore));
      await setSetting('vault_created_at', new Date().toISOString());

      _masterKey = key;
      _seedSalt = salt;
      return true;
    }
  }

  // ─── PIN Management ───

  async setPin(pin) {
    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be exactly 6 digits');
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await _hashPin(pin, salt);

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

    if (!saltB64 || !hashB64) {
      // No PIN set yet — accept any 6 digits (first use)
      await this.setPin(pin);
      _pinValid = true;
      _pinAttempts = 0;
      _resetAutoLock();
      return true;
    }

    const salt = base64ToUint8(saltB64);
    const storedHash = base64ToUint8(hashB64);
    const computedHash = await _hashPin(pin, salt);

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
    // Also listen for visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        _resetAutoLock(); // Reset timer when hidden
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

    // Update chain head
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
      throw new Error('INTEGRITY_FAIL: Envelope hash mismatch — data may be tampered');
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

// Handle auto-lock on tab hidden
window.addEventListener('beforeunload', () => {
  cryptoService.lock();
});
