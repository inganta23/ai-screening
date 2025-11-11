const express = require("express");
const router = express.Router();
const {
  ingestDocument,
  retrieveRelevantContext,
} = require("../services/chromaService");

router.post("/", async (req, res) => {
  try {
    const { docId, content, metadata } = req.body;

    if (!docId || !content) {
      return res.status(400).json({ error: "docId and content are required" });
    }

    await ingestDocument(docId, content, metadata || {});
    res
      .status(200)
      .json({ message: `Document ${docId} ingested successfully` });
  } catch (err) {
    console.error("Ingest error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/context", async (req, res) => {
  const { query, topK, filter } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Missing required field: query." });
  }

  if (typeof query !== "string") {
    return res.status(400).json({ error: "Query must be a non-empty string." });
  }

  try {
    const safeTopK = Math.max(1, Math.min(20, Number(topK) || 8));
    const contextDocuments = await retrieveRelevantContext(
      query,
      safeTopK,
      filter
    );

    res.status(200).json({
      status: "success",
      topK: contextDocuments.length,
      context: contextDocuments,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

module.exports = router;
