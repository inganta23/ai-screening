const config = require("../config");
const crypto = require("crypto");
const { pipeline } = require("@xenova/transformers");
const { ChromaClient } = require("chromadb");

const CHROMA_HOST = config.chromaHost || "http://chroma:8000";
const COLLECTION_NAME = config.chromaCollectionGroundtruth || "ground_truth";

const client = new ChromaClient({
  path: CHROMA_HOST,
  tenant: "default_tenant",
  database: "default_database",
});

async function ensureCollection() {
  try {
    await client.getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction: null,
    });
    console.log(`[Chroma] Collection '${COLLECTION_NAME}' created.`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`[Chroma] Collection '${COLLECTION_NAME}' already exists.`);
    } else {
      console.error("[Chroma] Failed to ensure collection:", err.message);
    }
  }
}

function chunkText(text, chunkSize = 1200, overlap = 150) {
  const words = text.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

async function embedTextBatch(texts) {
  try {
    console.log("Start embedding texts...");
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );

    const embeddings = [];
    for (const text of texts) {
      const result = await extractor(text, {
        pooling: "mean",
        normalize: true,
      });
      embeddings.push(Array.from(result.data));
    }

    console.log(`Successfully embedded ${texts.length} texts`);
    return embeddings;
  } catch (error) {
    console.error("Local embedding failed:", error);
    throw error;
  }
}

/**
 * @param {string} docId - unique ID (e.g. "case_study_v1")
 * @param {string} content - raw text of the document
 * @param {object} metadata - {source: 'case_brief', type: 'project'}
 */
async function ingestDocument(docId, content, metadata = {}) {
  const chunks = chunkText(content);
  console.log(`[Chroma] Ingesting ${chunks.length} chunks for ${docId}`);

  const embeddings = await embedTextBatch(chunks);

  const ids = chunks.map(
    (_, idx) => `${docId}_${crypto.randomUUID().slice(0, 8)}_${idx}`
  );

  const payload = {
    ids,
    embeddings,
    metadatas: chunks.map(() => metadata),
    documents: chunks,
  };

  const collection = await client.getCollection({
    name: COLLECTION_NAME,
  });

  await collection.add(payload);
  console.log(`[Chroma] ✅ Document ${ids} ingested (${chunks.length} chunks)`);
}

/**
 * @param {string} query - The text to find context for (e.g., project report)
 * @param {number} topK - How many chunks to return
 * @param {object} filter - Metadata filter, e.g., { type: 'project' }
 */
async function retrieveRelevantContext(query, topK = 8, filter = {}) {
  const queryEmbedding = await embedTextBatch([query]);
  const embedding = queryEmbedding[0];

  const collection = await client.getCollection({
    name: COLLECTION_NAME,
  });

  const results = await collection.query({
    queryEmbeddings: [embedding],
    nResults: topK,
    where: filter,
  });

  const docs = results.documents?.[0] || [];
  return docs;
}

module.exports = {
  ensureCollection,
  ingestDocument,
  retrieveRelevantContext,
};
