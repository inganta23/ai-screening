const express = require("express");
const bodyParser = require("body-parser");
const config = require("./config");
const uploadRouter = require("./routes/upload");
const evaluateRouter = require("./routes/evaluate");
const resultRouter = require("./routes/result");
const ingestRouter = require("./routes/ingest");

const { ensureBucket } = require("./services/storageService");
const { ensureCollection } = require("./services/chromaService");

const app = express();
app.use(bodyParser.json());

app.use("/ingest", ingestRouter);
app.use("/upload", uploadRouter);
app.use("/evaluate", evaluateRouter);
app.use("/result", resultRouter);

app.get("/", (req, res) =>
  res.json({ ok: true, msg: "AI Evaluator API (skeleton)" })
);

(async () => {
  await ensureBucket();
  await ensureCollection();

  const port = config.port;
  app.listen(port, () => console.log(`Server running on port ${port}`));
})();
