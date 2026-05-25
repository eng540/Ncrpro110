/**

crypto/canonical.js

Byte-level canonicalization for integrity computation

Format: [version:1][iv_len:1][iv][ct_len:4][ct][aad_len:2][aad]

All lengths: big-endian unsigned

All strings: UTF-8
*/


const TEXT_ENCODER = new TextEncoder();

/**

Serialize IV + Ciphertext + AAD into deterministic byte array

@param {Uint8Array} iv - 12 bytes

@param {Uint8Array} ct - ciphertext + auth tag

@param {string} aad - Additional Authenticated Data (canonical JSON)

@returns {Uint8Array} serialized bytes
*/
export function serializeForIntegrity(iv, ct, aad) {
if (!(iv instanceof Uint8Array)) throw new TypeError('iv must be Uint8Array');
if (!(ct instanceof Uint8Array)) throw new TypeError('ct must be Uint8Array');
if (typeof aad !== 'string') throw new TypeError('aad must be string');


const aadBytes = TEXT_ENCODER.encode(aad);

if (iv.length > 255) throw new RangeError('IV too long');
if (aadBytes.length > 65535) throw new RangeError('AAD too long');

const total = 1 + 1 + iv.length + 4 + ct.length + 2 + aadBytes.length;
const buf = new Uint8Array(total);
let offset = 0;

// Version byte
buf[offset++] = 0x01;

// IV length (1 byte)
buf[offset++] = iv.length;
buf.set(iv, offset);
offset += iv.length;

// CT length (4 bytes, big-endian)
const ctLen = ct.length;
buf[offset++] = (ctLen >>> 24) & 0xFF;
buf[offset++] = (ctLen >>> 16) & 0xFF;
buf[offset++] = (ctLen >>> 8) & 0xFF;
buf[offset++] = ctLen & 0xFF;
buf.set(ct, offset);
offset += ct.length;

// AAD length (2 bytes, big-endian)
buf[offset++] = (aadBytes.length >>> 8) & 0xFF;
buf[offset++] = aadBytes.length & 0xFF;
buf.set(aadBytes, offset);

return buf;
}

/**

Compute SHA-256 integrity hash

@returns {string} "sha256:<base64url>"
*/
export async function computeIntegrityHash(iv, ct, aad) {
const serialized = serializeForIntegrity(iv, ct, aad);
const hashBuffer = await crypto.subtle.digest('SHA-256', serialized);
return 'sha256:' + base64urlEncode(new Uint8Array(hashBuffer));
}


/**

Compute chain hash linking previous to current

@param {string|null} prevChainHash - "sha256:..." or null for genesis

@param {string} currentIntegrityHash - "sha256:..."

@returns {string} "sha256:<base64url>"
*/
export async function computeChainHash(prevChainHash, currentIntegrityHash) {
const prevBytes = prevChainHash
? base64urlDecode(prevChainHash.replace('sha256:', ''))
: new Uint8Array(32); // zeros for genesis


const currBytes = base64urlDecode(currentIntegrityHash.replace('sha256:', ''));

const combined = new Uint8Array(64);
combined.set(prevBytes, 0);
combined.set(currBytes, 32);

const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
return 'sha256:' + base64urlEncode(new Uint8Array(hashBuffer));
}

// Base64url encoding (no padding)
export function base64urlEncode(buf) {
return btoa(String.fromCharCode(...buf))
.replace(/\+/g, '-')
.replace(/\//g, '_')
.replace(/=+$/, '');
}

export function base64urlDecode(str) {
str += new Array(5 - str.length % 4).join('=');
str = str.replace(/\-/g, '+').replace(/\_/g, '/');
return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}
