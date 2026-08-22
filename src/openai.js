"use strict";

const { redactPersonalData } = require("./analysis");

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "concerns", "interviewQuestions"],
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 5 },
    concerns: { type: "array", items: { type: "string" }, maxItems: 5 },
    interviewQuestions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "purpose"],
        properties: {
          question: { type: "string" },
          purpose: { type: "string" }
        }
      }
    }
  }
};

function extractResponseText(response) {
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("The model returned no text output.");
}

async function enrichWithOpenAI({ resumeText, role, baseline, apiKey, model }) {
  const safeResume = redactPersonalData(resumeText, baseline.candidate.name).slice(0, 50000);
  const prompt = [
    "You are an evidence-focused recruiting assistant. You support, but never replace, a human recruiter.",
    "Use only job-relevant evidence explicitly present in the résumé. Do not infer or use age, gender, race, ethnicity, religion, disability, family status, nationality, address, photograph, school prestige, or other protected/personal traits.",
    "Do not change the deterministic match score. Write a concise neutral summary, job-related strengths, evidence gaps phrased as items to verify, and exactly five structured interview questions.",
    "Never claim that a candidate definitely has a skill when evidence is missing.",
    `ROLE TITLE: ${role.title}`,
    `MINIMUM EXPERIENCE BASELINE: ${role.minExperience || 0} years`,
    `REQUIRED SKILLS: ${role.requiredSkills || "Not specified"}`,
    `PREFERRED SKILLS: ${role.preferredSkills || "Not specified"}`,
    `JOB DESCRIPTION:\n${String(role.jobDescription || "").slice(0, 12000)}`,
    `DETERMINISTIC EVIDENCE RESULT:\n${JSON.stringify({
      score: baseline.score,
      matchedRequired: baseline.matchedRequired,
      missingRequired: baseline.missingRequired,
      matchedPreferred: baseline.matchedPreferred,
      experienceYears: baseline.experienceYears
    })}`,
    `REDACTED RÉSUMÉ:\n${safeResume}`
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: "Return only the requested structured result.",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "candidate_narrative",
          strict: true,
          schema: OUTPUT_SCHEMA
        }
      }
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${details.slice(0, 300)}`);
  }

  const payload = await response.json();
  return JSON.parse(extractResponseText(payload));
}

module.exports = { enrichWithOpenAI, extractResponseText };
