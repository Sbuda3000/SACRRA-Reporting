const openpgp = require("openpgp");
const fs = require("fs");

async function encryptFile(filePath, publicKeyArmored) {
  // Read your plaintext file
  const data = fs.readFileSync(filePath, "utf8");
  console.log("Data ", data);

  // Load the public key (you’ll store this as env variable in Render)
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

  // Encrypt
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: data }),
    encryptionKeys: publicKey,
    config: { 
      preferredCompressionAlgorithm: openpgp.enums.compression.zip,
      allowMissingKeyFlags: true
    }
  });

  // Save encrypted file
  const encryptedPath = filePath + ".pgp";
  fs.writeFileSync(encryptedPath, encrypted);
  return encryptedPath;
}

module.exports = { encryptFile }
