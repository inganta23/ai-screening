const express = require("express");
const { evaluationQueue, connection } = require("../services/jobQueue");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { job_title, cv_id, report_id } = req.body;
    if (!job_title || !cv_id || !report_id) {
      return res
        .status(400)
        .json({ error: "job_title, cv_id and report_id are required" });
    }

    const jobId = `job_${uuidv4()}`;

    const redis = connection;
    await redis.hset(`job:${jobId}`, {
      status: "queued",
      job_title,
      cv_id,
      report_id,
      created_at: new Date().toISOString(),
    });

    await evaluationQueue.add("evaluate", {
      jobId,
      job_title,
      cv_id,
      report_id,
    });

    return res.status(202).json({ job_id: jobId, status: "queued" });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "failed to enqueue job", detail: err.message });
  }
});

module.exports = router;
