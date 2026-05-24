/**
 * crypto/cryptoService.js
 * Reverse-Engineered & Architected by Principal System Agent
 * 
 * Core Security Engine:
 * - Argon2id for Master Key Derivation
 * - AES-GCM-256 for Payload Encryption
 * - PBKDF2 for PIN Management
 * - In-Memory Key Lifecycle (Zero-Storage)
 */

import argon2 from 'argon2-browser';
import { Envelope, canonicalAAD } from './envelope.js';
import { getSetting, setSetting } from '../db/index.js';

class CryptoService {
  constructor() {
    this._masterKey = null; // NEVER STORED IN DB/LOCALSTORAGE
    this._pinValidUntil = 0;
    this._lockTimeout = null;
    this._LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  }

  // ==========================================
  // 1. Master Key Management (Argon2id)
  // ==========================================

  async _generateSalt() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    await setSetting('seed_salt', saltHex);
    return salt;
  }

  async _getSalt() {
    const saltHex = await getSetting('seed_salt');
    if (!saltHex) return null;
    return new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  }

  async unlockSeed(password) {
    let salt = await this._getSalt();
    const isNew = !salt;
    
    if (isNew) {
      salt = await this._generateSalt();
    }

    try {
      // Argon2id Configuration (High Security)
      const hash = await argon2.hash({
        pass: password,
        salt: salt,
        time: 3,
        mem: 64 * 1024, // 64 MB
        hashLen: 32, // 256-bit key for AES
        parallelism: 4,
        type: argon2.types.Argon2id
      });

      // Import the raw key into Web Crypto API
      this._masterKey = await crypto.subtle.importKey(
        'raw',
        hash.hash,
        { name: 'AES-GCM' },
        false, // Not extractable
        ['encrypt', 'decrypt']
      );

      // Verify key if not new (by trying to decrypt a known test vector)
      if (!isNew) {
        const testVector = await getSetting('test_vector');
        if (testVector) {
          try {
            await this.decryptField(testVector);
          } catch (e) {
            this._masterKey = null;
            throw new Error('INVALID_PASSWORD');
          }
        }
      } else {
        // Create test vector for future verifications
        const testEnv = await this.encryptField('NRC_SECURE_VAULT', { entity: 'system', field: 'test', rid: '0' });
        await setSetting('test_vector', testEnv.toDB());
      }

      return true;
    } catch (error) {
      this._masterKey = null;
      throw error;
    }
  }

  isLocked() {
    return this._masterKey === null;
  }

  lock() {
    this._masterKey = null;
    this._pinValidUntil = 0;
    if (this._lockTimeout) clearTimeout(this._lockTimeout);
  }

  _startAutoLock() {
    if (this._lockTimeout) clearTimeout(this._lockTimeout);
    this._lockTimeout = setTimeout(() => this.lock(), this._LOCK_DURATION_MS);
    
    // Reset timer on user activity
    const resetTimer = () => {
      if (!this.isLocked()) {
        clearTimeout(this._lockTimeout);
        this._lockTimeout = setTimeout(() => this.lock(), this._LOCK_DURATION_MS);
      }
    };
    
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('touchstart', resetTimer);
  }

  // ==========================================
  // 2. PIN Management (PBKDF2)
  // ==========================================

  async setPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
    
    const hashBuffer = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    );

    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    
    await setSetting('pin_hash', `${saltHex}:${hashHex}`);
  }

  async verifyPin(pin) {
    const stored = await getSetting('pin_hash');
    if (!stored) return false;

    const [saltHex, hashHex] = stored.split(':');
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
    
    const hashBuffer = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    );

    const computedHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (computedHex === hashHex) {
      this._pinValidUntil = Date.now() + (30 * 60 * 1000); // PIN valid for 30 mins
      return true;
    }
    return false;
  }

  isPinValid() {
    return Date.now() < this._pinValidUntil;
  }

  // ==========================================
  // 3. Encryption / Decryption (AES-GCM)
  // ==========================================

  async encryptField(plaintext, meta) {
    if (this.isLocked()) throw new Error('SEED_LOCKED');

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encodedPlaintext = enc.encode(plaintext);
    
    // Generate Canonical AAD
    const aadString = canonicalAAD(meta.entity, meta.rid);
    const aadBytes = enc.encode(aadString);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: aadBytes },
      this._masterKey,
      encodedPlaintext
    );

    const ct = new Uint8Array(ciphertextBuffer);

    // Get previous chain hash for integrity
    const { getChainHead, updateChainHead } = await import('../db/index.js');
    const prevChainHash = await getChainHead(meta.entity);

    // Create Envelope
    const env = await Envelope.create(iv, ct, aadString, meta, prevChainHash);
    
    // Update chain head
    await updateChainHead(meta.entity, env.int.c);

    return env;
  }

  async decryptField(dbRecord) {
    if (this.isLocked()) throw new Error('SEED_LOCKED');
    if (!dbRecord || !dbRecord._env) return null;

    const env = Envelope.fromDB(dbRecord);
    
    // Verify Integrity Hash before decryption
    const isValid = await env.verify();
    if (!isValid) throw new Error('INTEGRITY_CHECK_FAILED');

    const enc = new TextEncoder();
    const aadBytes = enc.encode(env.aad);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: env.iv, additionalData: aadBytes },
        this._masterKey,
        env.ct
      );

      const dec = new TextDecoder();
      return dec.decode(decryptedBuffer);
    } catch (error) {
      throw new Error('DECRYPTION_FAILED');
    }
  }
}

export const cryptoService = new CryptoService();