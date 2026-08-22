"use strict";

require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const { analyzeDeterministically, cleanText } = require("./src/analysis");
const { enrichWithOpenAI } = require("./src/openai");

const app = express();
const PORT = Number(process.env.PORT) || 3210;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function extractResumeText(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === ".txt" || extension === ".md") return file.buffer.toString("utf8");
  if (extension === ".docx") return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (extension === ".pdf") return (await pdfParse(file.buffer)).text;
  throw new Error("Unsupported file type. Use PDF, DOCX, TXT, or MD.");
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: MODEL,
    mode: process.env.OPENAI_API_KEY ? "AI enrichment available" : "Demo mode"
  });
});

app.post("/api/analyze", upload.array("resumes", 10), async (request, response) => {
  const role = {
    title: cleanText(request.body.roleTitle),
    minExperience: Number(request.body.minExperience) || 0,
    requiredSkills: cleanText(request.body.requiredSkills),
    preferredSkills: cleanText(request.body.preferredSkills),
    jobDescription: cleanText(request.body.jobDescription)
  };

  if (!role.title) return response.status(400).json({ error: "Enter a role title." });
  if (!role.requiredSkills && !role.jobDescription) {
    return response.status(400).json({ error: "Add required skills or a job description." });
  }
  if (!request.files?.length) return response.status(400).json({ error: "Upload at least one résumé." });

  const useAI = request.body.useAI === "true" && Boolean(process.env.OPENAI_API_KEY);
  const candidates = [];

  for (const file of request.files) {
    try {
      const resumeText = cleanText(await extractResumeText(file));
      if (resumeText.length < 80) throw new Error("Not enough readable text was found in this file.");

      const result = analyzeDeterministically({ text: resumeText, filename: file.originalname, role });
      result.id = crypto.randomUUID();
      result.filename = file.originalname;

      if (useAI) {
        try {
          const enrichment = await enrichWithOpenAI({
            resumeText,
            role,
            baseline: result,
            apiKey: process.env.OPENAI_API_KEY,
            model: MODEL
          });
          Object.assign(result, enrichment, { analysisMode: "hybrid_ai" });
        } catch (error) {
          result.aiWarning = "AI enrichment was unavailable, so the auditable local analysis was used.";
          console.error(error.message);
        }
      }
      candidates.push(result);
    } catch (error) {
      candidates.push({
        id: crypto.randomUUID(),
        filename: file.originalname,
        error: error.message
      });
    }
  }

  candidates.sort((a, b) => (b.score || -1) - (a.score || -1));
  response.json({
    candidates,
    role,
    metadata: {
      analyzedAt: new Date().toISOString(),
      requestedAI: request.body.useAI === "true",
      usedAI: useAI,
      model: useAI ? MODEL : null
    }
  });
});

function formatICSDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

app.post("/api/schedule", (request, response) => {
  const {
    candidateName,
    candidateEmail,
    roleTitle,
    startTime,
    duration = 45,
    interviewerName = "Hiring Team",
    meetingLink = ""
  } = request.body;

  const start = new Date(startTime);
  if (!candidateName || !roleTitle || Number.isNaN(start.getTime())) {
    return response.status(400).json({ error: "Candidate, role, and a valid interview time are required." });
  }

  const end = new Date(start.getTime() + Math.max(15, Number(duration)) * 60_000);
  const subject = `Interview invitation — ${roleTitle}`;
  const emailBody = [
    `Hi ${candidateName},`,
    "",
    `We would like to invite you to an interview for the ${roleTitle} position.`,
    `Time: ${start.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}`,
    `Duration: ${Math.max(15, Number(duration))} minutes`,
    meetingLink ? `Meeting link: ${meetingLink}` : "Meeting details: to be confirmed",
    "",
    "Please reply to confirm that this time works for you.",
    "",
    `Regards,\n${interviewerName}`
  ].join("\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ShortlistAI//Interview Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@shortlist-ai.local`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${escapeICS(`Interview: ${candidateName} — ${roleTitle}`)}`,
    `DESCRIPTION:${escapeICS(emailBody)}`,
    meetingLink ? `LOCATION:${escapeICS(meetingLink)}` : "",
    candidateEmail ? `ATTENDEE;CN=${escapeICS(candidateName)}:MAILTO:${candidateEmail}` : "",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");

  response.json({ subject, emailBody, ics, note: "Drafted only—nothing was sent automatically." });
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    return response.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Each résumé must be under 5 MB." : error.message });
  }
  console.error(error);
  response.status(500).json({ error: "Unexpected server error." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ShortlistAI is running at http://localhost:${PORT}`);
    console.log(process.env.OPENAI_API_KEY ? `AI enrichment enabled with ${MODEL}` : "Running in deterministic demo mode (no API key required)");
  });
}

module.exports = { app, extractResumeText, formatICSDate };
