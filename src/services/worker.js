const { Worker } = require("bullmq");
const { connection } = require("./jobQueue");
const Redis = connection;

const { parsePdfFromMinio } = require("../utils/pdfParser");
const { ingestDocument, retrieveRelevantContext } = require("./chromaService");
const { callWithRetries } = require("./llmService");

const CV_SYSTEM = `You are an expert technical recruiter and scorecard engine. Produce a numeric match score (0.0–1.0) and concise feedback for a candidate CV against the provided job requirements and the CV scoring rubric. Follow the scoring rubric weights and return only the JSON object requested.`;

function buildCvUserPrompt(ragChunks, cvText) {
  return `
--- JOB CONTEXT (RAG chunks) ---
${ragChunks.join("\n\n")}

--- CV TEXT ---
${cvText}

--- SCORING RUBRIC (short) ---
Technical Skills Match (40%), Experience Level (25%), Relevant Achievements (20%), Cultural Fit (15%).
For each rubric item, score 1–5. Then compute a weighted average and convert to decimal 0.0–1.0 (scale: 1→0.2, 5→1.0). Round to two decimal places.

Return JSON exactly in this format:
{
  "cv_match_rate": 0.xx,
  "cv_feedback": "short paragraph (2-4 sentences)",
  "breakdown": {
     "technical_skills": 1..5,
     "experience_level": 1..5,
     "achievements": 1..5,
     "cultural_fit": 1..5
  }
}
`.trim();
}

const PROJECT_SYSTEM = `You are an expert engineering reviewer. Evaluate the candidate's project report against the Project Context and Project Scoring Rubric. Provide a numeric project_score (1.0–5.0) and project_feedback.`;

function buildProjectUserPrompt(ragChunks, reportText) {
  return `
--- PROJECT CONTEXT (RAG chunks) ---
${ragChunks.join("\n\n")}

--- PROJECT REPORT TEXT ---
${reportText}

--- PROJECT RUBRIC (short) ---
Correctness (30%), Code Quality (25%), Resilience & Error Handling (20%), Documentation (15%), Creativity/Bonus (10%).
For each criterion, score 1–5. Compute weighted average -> project_score (scale 1.0–5.0). Round to one decimal place.

Return JSON exactly:
{
  "project_score": x.x,
  "project_feedback": "short paragraph (2-4 sentences)",
  "breakdown": {
     "correctness": 1..5,
     "code_quality": 1..5,
     "resilience": 1..5,
     "documentation": 1..5,
     "creativity": 1..5
  }
}
`.trim();
}

const FINAL_SYSTEM = `You are a senior hiring manager summarizing candidate evaluation outputs. Produce a concise 3–5 sentence overall_summary that highlights major strengths, main gaps, and one actionable recommendation. Use only the CV and Project structured outputs provided.`;

function buildFinalUserPrompt(cvResult, projectResult) {
  return `
CV evaluation:
${JSON.stringify(cvResult, null, 2)}

Project evaluation:
${JSON.stringify(projectResult, null, 2)}

Return exactly:
{
  "overall_summary": "3–5 sentence summary"
}
`.trim();
}

function clamp(n, lo, hi) {
  if (typeof n !== "number" || Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function computeCvMatchRateFromBreakdown(bd) {
  const tech = parseFloat(bd.technical_skills) || 1;
  const exp = parseFloat(bd.experience_level) || 1;
  const ach = parseFloat(bd.achievements) || 1;
  const cult = parseFloat(bd.cultural_fit) || 1;

  const weighted = (tech * 0.4 + exp * 0.25 + ach * 0.2 + cult * 0.15) / 5.0;
  return Math.round(weighted * 100) / 100; // 2 decimals
}

function computeProjectScoreFromBreakdown(bd) {
  const corr = parseFloat(bd.correctness) || 1;
  const code = parseFloat(bd.code_quality) || 1;
  const res = parseFloat(bd.resilience) || 1;
  const doc = parseFloat(bd.documentation) || 1;
  const cre = parseFloat(bd.creativity) || 1;

  const weighted =
    corr * 0.3 + code * 0.25 + res * 0.2 + doc * 0.15 + cre * 0.1;
  return Math.round(weighted * 10) / 10;
}

function validateAndNormalizeCvResult(parsed) {
  const res = {
    cv_match_rate: null,
    cv_feedback: "",
    breakdown: {
      technical_skills: 1,
      experience_level: 1,
      achievements: 1,
      cultural_fit: 1,
    },
    validation_notes: [],
  };

  if (!parsed || typeof parsed !== "object") {
    res.validation_notes.push("parsed CV result missing or invalid");
    res.cv_match_rate = 0.2;
    res.cv_feedback = "No structured CV result returned";
    return res;
  }

  if (parsed.breakdown) {
    const bd = parsed.breakdown;
    res.breakdown.technical_skills = clamp(
      Math.round(Number(bd.technical_skills) || 1),
      1,
      5
    );
    res.breakdown.experience_level = clamp(
      Math.round(Number(bd.experience_level) || 1),
      1,
      5
    );
    res.breakdown.achievements = clamp(
      Math.round(Number(bd.achievements) || 1),
      1,
      5
    );
    res.breakdown.cultural_fit = clamp(
      Math.round(Number(bd.cultural_fit) || 1),
      1,
      5
    );
  } else {
    res.validation_notes.push("breakdown missing");
  }

  const recomputed = computeCvMatchRateFromBreakdown(res.breakdown);
  res.cv_match_rate = recomputed;

  res.cv_feedback = parsed.cv_feedback
    ? String(parsed.cv_feedback).trim()
    : "No feedback provided";

  return res;
}

function validateAndNormalizeProjectResult(parsed) {
  const res = {
    project_score: null,
    project_feedback: "",
    breakdown: {
      correctness: 1,
      code_quality: 1,
      resilience: 1,
      documentation: 1,
      creativity: 1,
    },
    validation_notes: [],
  };

  if (!parsed || typeof parsed !== "object") {
    res.validation_notes.push("parsed project result missing or invalid");
    res.project_score = 1.0;
    res.project_feedback = "No structured project result returned";
    return res;
  }

  if (parsed.breakdown) {
    const bd = parsed.breakdown;
    res.breakdown.correctness = clamp(
      Math.round(Number(bd.correctness) || 1),
      1,
      5
    );
    res.breakdown.code_quality = clamp(
      Math.round(Number(bd.code_quality) || 1),
      1,
      5
    );
    res.breakdown.resilience = clamp(
      Math.round(Number(bd.resilience) || 1),
      1,
      5
    );
    res.breakdown.documentation = clamp(
      Math.round(Number(bd.documentation) || 1),
      1,
      5
    );
    res.breakdown.creativity = clamp(
      Math.round(Number(bd.creativity) || 1),
      1,
      5
    );
  } else {
    res.validation_notes.push("breakdown missing");
  }

  res.project_score = computeProjectScoreFromBreakdown(res.breakdown);
  res.project_feedback = parsed.project_feedback
    ? String(parsed.project_feedback).trim()
    : "No feedback provided";

  return res;
}

const worker = new Worker(
  "evaluation",
  async (job) => {
    const payload = job.data;
    const jobId = payload.jobId;
    const jobKey = `job:${jobId}`;
    console.log(`[Worker] start job ${jobId}`, payload);

    await Redis.hset(jobKey, {
      status: "processing",
      started_at: new Date().toISOString(),
      job_title: payload.job_title || "",
    });

    try {
      await Redis.hset(jobKey, "step_parse", "started");
      const cvText = await parsePdfFromMinio(payload.cv_id);
      const projectText = await parsePdfFromMinio(payload.report_id);

      await Redis.hset(
        jobKey,
        "step_parse",
        "done",
        "cv_length",
        cvText.length,
        "project_length",
        projectText.length
      );

      try {
        await ingestDocument(payload.cv_id, cvText, {
          source: "candidate_cv",
          type: "candidate",
        });
        await ingestDocument(payload.report_id, projectText, {
          source: "candidate_project",
          type: "candidate",
        });
        await Redis.hset(jobKey, "step_ingest_candidates", "done");
      } catch (e) {
        console.warn(
          "[Worker] candidate ingest failed (continuing):",
          e.message
        );
        await Redis.hset(
          jobKey,
          "step_ingest_candidates",
          "failed",
          "ingest_error",
          e.message
        );
      }

      await Redis.hset(jobKey, "step_rag", "started");
      const cvRagChunks = await retrieveRelevantContext(cvText, 6, {
        type: "cv_context",
      }).catch((err) => {
        console.warn("cv retrieve error", err.message);
        return [];
      });
      const cvRagRubric = await retrieveRelevantContext(cvText, 4, {
        type: "cv_rubric",
      }).catch(() => []);
      const cvContext = [...(cvRagChunks || []), ...(cvRagRubric || [])].slice(
        0,
        10
      );

      const projectRagChunks = await retrieveRelevantContext(projectText, 8, {
        type: "project_context",
      }).catch(() => []);
      const projectRagRubric = await retrieveRelevantContext(projectText, 4, {
        type: "project_rubric",
      }).catch(() => []);
      const projectContext = [
        ...(projectRagChunks || []),
        ...(projectRagRubric || []),
      ].slice(0, 12);

      await Redis.hset(
        jobKey,
        "step_rag",
        "done",
        "cv_context_count",
        cvContext.length,
        "project_context_count",
        projectContext.length
      );

      await Redis.hset(jobKey, "step_cv_eval", "started");
      const cvUserPrompt = buildCvUserPrompt(cvContext, cvText);
      const rawCvParsed = await callWithRetries(CV_SYSTEM, cvUserPrompt);
      const cvEval = validateAndNormalizeCvResult(rawCvParsed);

      await Redis.hset(
        jobKey,
        "cv_result",
        JSON.stringify(cvEval),
        "step_cv_eval",
        "done"
      );

      await Redis.hset(jobKey, "step_project_eval", "started");
      const projUserPrompt = buildProjectUserPrompt(
        projectContext,
        projectText
      );
      const rawProjParsed = await callWithRetries(
        PROJECT_SYSTEM,
        projUserPrompt
      );
      const projEval = validateAndNormalizeProjectResult(rawProjParsed);
      await Redis.hset(
        jobKey,
        "project_result",
        JSON.stringify(projEval),
        "step_project_eval",
        "done"
      );

      await Redis.hset(jobKey, "step_final", "started");
      const finalUserPrompt = buildFinalUserPrompt(cvEval, projEval);
      const rawFinal = await callWithRetries(FINAL_SYSTEM, finalUserPrompt);
      const overallSummary =
        rawFinal && rawFinal.overall_summary
          ? String(rawFinal.overall_summary).trim()
          : "No summary provided";

      const finalResult = {
        cv_match_rate: clamp(Number(cvEval.cv_match_rate), 0.0, 1.0),
        cv_feedback: cvEval.cv_feedback,
        cv_breakdown: cvEval.breakdown,
        project_score: clamp(Number(projEval.project_score), 1.0, 5.0),
        project_feedback: projEval.project_feedback,
        project_breakdown: projEval.breakdown,
        overall_summary: overallSummary,
        meta: {
          steps: {
            parse: "done",
            ingest_candidates: true,
            rag_cv_count: cvContext.length,
            rag_project_count: projectContext.length,
          },
          timestamps: { completed_at: new Date().toISOString() },
        },
      };

      await Redis.hset(jobKey, {
        status: "completed",
        result: JSON.stringify(finalResult),
        completed_at: new Date().toISOString(),
      });

      console.log(`[Worker] job ${jobId} completed`);
      return finalResult;
    } catch (err) {
      console.error(`[Worker] job ${payload.jobId} failed:`, err);
      await Redis.hset(jobKey, {
        status: "failed",
        error: err.message,
        failed_at: new Date().toISOString(),
      });
      throw err;
    }
  },
  {
    connection,
  }
);

worker.on("completed", (job) =>
  console.log(`[Worker] Bull job ${job.id} completed`)
);
worker.on("failed", (job, err) =>
  console.error(`[Worker] Bull job ${job.id} failed: ${err?.message || err}`)
);

module.exports = worker;
