const { extractText, getDocumentProxy } = require("unpdf");
const { getObjectBuffer } = require("../services/storageService");

async function parsePdfFromMinio(key) {
  const buffer = await getObjectBuffer(key);

  if (!Buffer.isBuffer(buffer)) {
    console.log("Data is NOT a Buffer");
    console.log("Type:", typeof buffer);
    console.log("Constructor:", buffer?.constructor?.name);
  }

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

module.exports = { parsePdfFromMinio };
