const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const storage = require("../services/storageService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post(
  "/",
  upload.fields([{ name: "cv" }, { name: "report" }]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.cv || !req.files.report) {
        return res
          .status(400)
          .json({ error: "cv and report PDF files are required" });
      }

      const cvBuffer = req.files.cv[0].buffer;
      const reportBuffer = req.files.report[0].buffer;

      const cvId = `cv_${uuidv4()}.pdf`;
      const repId = `rep_${uuidv4()}.pdf`;

      await storage.uploadBuffer(cvId, cvBuffer, "application/pdf");
      await storage.uploadBuffer(repId, reportBuffer, "application/pdf");

      return res.json({
        cv_id: cvId,
        report_id: repId,
        message: "Files uploaded successfully",
      });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "upload failed", detail: err.message });
    }
  }
);

module.exports = router;
