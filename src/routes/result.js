const express = require("express");
const { connection } = require("../services/jobQueue");

const router = express.Router();

router.get("/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const redis = connection;

    const exists = await redis.exists(`job:${jobId}`);
    if (!exists) return res.status(404).json({ error: "job not found" });

    const job = await redis.hgetall(`job:${jobId}`);

    if (job.result) {
      try {
        job.result = JSON.parse(job.result);
        if (job.result.meta) {
          delete job.result.meta;
        }
      } catch (e) {}
    }
    return res.json({
      job_id: jobId,
      status: job.status || "queued",
      result: job.result,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "failed to fetch job", detail: err.message });
  }
});

module.exports = router;
