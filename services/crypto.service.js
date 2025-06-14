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

module.exports = { wrapAesKey };