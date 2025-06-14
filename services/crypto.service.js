const forge = require('node-forge');

/**
 * Wrap (encrypt) an AES key using an RSA public key (OAEP SHA-256) with node-forge.
 * @param {string} aesKeyHex - The AES key as a hex string.
 * @param {string} publicKeyPem - The RSA public key in PEM format.
 * @returns {string} - The wrapped AES key as a Base64 string.
 */
function wrapAesKey(aesKeyHex, publicKeyPem) {
    
    const aesKeyBuffer = Buffer.from(aesKeyHex, 'hex');
    const aesKeyBinary = aesKeyBuffer.toString('binary');

    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encrypted = publicKey.encrypt(aesKeyBinary, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: {
            md: forge.md.sha1.create()
        }
    });
    return forge.util.encode64(encrypted);
}

function generateRandomAesKey() {
    const key = forge.random.getBytesSync(32); // Generates a 256-bit AES key
    return forge.util.bytesToHex(key); // Convert to hex string
}
/**
 * Decrypts a Base64 encoded string that was encrypted with AES/GCM using the provided Java code's structure.
 * The expected structure of the decoded data is: [iv_length (1 byte), iv, ciphertext, authentication_tag].
 *
 * @param {string} base64Ciphertext The Base64 encoded ciphertext string.
 * @param {string} aesKeyHex The AES key as a hexadecimal string. The key must be 16, 24, or 32 bytes long (for AES-128, AES-192, or AES-256).
 * @returns {string|null} The decrypted plaintext as a UTF-8 string, or null if decryption fails.
 */
function decryptData(base64Ciphertext, aesKeyHex) {
  try {
    // 1. Decode the Base64 string to get the combined byte buffer
    const combined = Buffer.from(base64Ciphertext, 'base64');

    // 2. Parse the combined buffer to extract IV, ciphertext, and tag
    
    // The first byte is the IV length. Your Java code hardcodes this to 12.
    const ivLength = combined.readUInt8(0);
    const tagLength = 16; // GCM standard tag length is 128 bits (16 bytes)

     // Use subarray() to create a view into the buffer without copying. This is the modern,
    // non-deprecated replacement for the old slice() behavior.
    const iv = combined.subarray(1, 1 + ivLength);
    const encryptedWithTag = combined.subarray(1 + ivLength);
    const tag = encryptedWithTag.subarray(encryptedWithTag.length - tagLength);
    const ciphertext = encryptedWithTag.subarray(0, encryptedWithTag.length - tagLength);

    // 3. Create the AES-GCM decipher in Node-forge
    // Note: The key must be in raw byte format. We convert it from hex.
    const keyBytes = forge.util.hexToBytes(aesKeyHex);
    const decipher = forge.cipher.createDecipher('AES-GCM', keyBytes);

    // 4. Start decryption process
    decipher.start({
      iv: forge.util.createBuffer(iv), // IV
      tagLength: tagLength * 8, // Tag length in bits
      tag: forge.util.createBuffer(tag), // The authentication tag
    });

    // 5. Provide the ciphertext and get the decrypted data
    decipher.update(forge.util.createBuffer(ciphertext));

    // 6. Finalize decryption - this checks the authentication tag
    const pass = decipher.finish();

    if (pass) {
      // If the tag is valid, return the decrypted data as a UTF-8 string
      return decipher.output.toString('utf8');
    } else {
      // If the tag is invalid, authentication failed. Do not trust the data.
      console.error('Authentication failed. The data may have been tampered with or the key is incorrect.');
      return null;
    }
  } catch (error) {
    console.error('An error occurred during decryption:', error);
    return null;
  }
}



module.exports = { wrapAesKey, decryptData, generateRandomAesKey };