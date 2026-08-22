"use strict";

const CURRENT_YEAR = new Date().getFullYear();

function cleanText(value = "") {
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseSkillList(value = "") {
  return [...new Set(
    String(value)
      .split(/[,;\n]/)
      .map((skill) => skill.trim())
      .filter(Boolean)
  )];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsSkill(text, skill) {
  const normalizedText = text.toLowerCase();
  const normalizedSkill = skill.toLowerCase().trim();
  if (!normalizedSkill) return false;

  const expression = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(normalizedSkill)}(?:$|[^a-z0-9])`,
    "i"
  );
  return expression.test(normalizedText);
}

function findSkillEvidence(text, skill) {
  const lines = cleanText(text).split("\n").filter(Boolean);
  const found = lines.find((line) => containsSkill(line, skill));
  if (!found) return "Mentioned in the résumé";
  return found.length > 160 ? `${found.slice(0, 157)}...` : found;
}

function extractCandidateInfo(text, fallbackName = "Candidate") {
  const cleaned = cleanText(text);
  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const email = cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = cleaned.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/)?.[0] || "";

  const nameLine = lines.find((line, index) => {
    if (index > 7 || line.length > 60 || /@|https?:|www\.|resume|curriculum vitae|profile/i.test(line)) return false;
    const words = line.split(/\s+/);
    return words.length >= 2 && words.length <= 5 && /^[A-Za-z][A-Za-z .'-]+$/.test(line);
  });

  const filenameName = fallbackName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(resume|cv)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: nameLine || filenameName || "Candidate",
    email,
    phone
  };
}

function estimateExperienceYears(text) {
  const cleaned = cleanText(text);
  const explicit = [...cleaned.matchAll(/(\d{1,2})(?:\+)?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+)?experience/gi)]
    .map((match) => Number(match[1]));

  const ranges = [...cleaned.matchAll(/\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(present|current|now|(?:19|20)\d{2})\b/gi)]
    .map((match) => {
      const start = Number(match[1]);
      const end = /present|current|now/i.test(match[2]) ? CURRENT_YEAR : Number(match[2]);
      return Math.max(0, Math.min(40, end - start));
    });

  return Math.min(40, Math.max(0, ...explicit, ...ranges));
}

function redactPersonalData(text, candidateName = "") {
  let redacted = cleanText(text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL REDACTED]")
    .replace(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g, "[PHONE REDACTED]")
    .replace(/^.*\b(?:date of birth|dob|gender|sex|marital status|nationality|religion|age)\b.*$/gim, "[PERSONAL DETAIL REDACTED]");

  if (candidateName && candidateName !== "Candidate") {
    redacted = redacted.replace(new RegExp(escapeRegExp(candidateName), "gi"), "[CANDIDATE NAME REDACTED]");
  }
  return redacted;
}

function analyzeDeterministically({ text, filename, role }) {
  const candidate = extractCandidateInfo(text, filename);
  const requiredSkills = parseSkillList(role.requiredSkills);
  const preferredSkills = parseSkillList(role.preferredSkills);
  const matchedRequired = requiredSkills.filter((skill) => containsSkill(text, skill));
  const missingRequired = requiredSkills.filter((skill) => !containsSkill(text, skill));
  const matchedPreferred = preferredSkills.filter((skill) => containsSkill(text, skill));
  const experienceYears = estimateExperienceYears(text);
  const minExperience = Math.max(0, Number(role.minExperience) || 0);

  const requiredScore = requiredSkills.length ? (matchedRequired.length / requiredSkills.length) * 55 : 55;
  const preferredScore = preferredSkills.length ? (matchedPreferred.length / preferredSkills.length) * 20 : 20;
  const experienceScore = minExperience ? Math.min(experienceYears / minExperience, 1) * 20 : 20;
  const evidenceScore = Math.min(cleanText(text).length / 1600, 1) * 5;
  const score = Math.round(requiredScore + preferredScore + experienceScore + evidenceScore);

  let recommendation = "review";
  if (score >= 75 && missingRequired.length <= Math.ceil(requiredSkills.length * 0.25)) recommendation = "strong_fit";
  else if (score >= 55) recommendation = "potential_fit";

  const skillEvidence = matchedRequired.map((skill) => ({
    skill,
    evidence: findSkillEvidence(text, skill)
  }));

  const strengths = [];
  if (matchedRequired.length) strengths.push(`Shows evidence for ${matchedRequired.length} of ${requiredSkills.length || matchedRequired.length} required skills.`);
  if (experienceYears >= minExperience && minExperience > 0) strengths.push(`Estimated experience meets the ${minExperience}-year baseline.`);
  if (matchedPreferred.length) strengths.push(`Also mentions ${matchedPreferred.join(", ")}.`);
  if (!strengths.length) strengths.push("Résumé contains enough information for a manual recruiter review.");

  const concerns = [];
  if (missingRequired.length) concerns.push(`No clear evidence found for: ${missingRequired.join(", ")}.`);
  if (minExperience && experienceYears < minExperience) concerns.push(`Estimated ${experienceYears} years versus the ${minExperience}-year baseline; verify dates manually.`);
  if (!concerns.length) concerns.push("No major job-related evidence gaps detected; claims still require interview verification.");

  const questions = [];
  matchedRequired.slice(0, 2).forEach((skill) => questions.push({
    question: `Tell me about a project where you used ${skill}. What was your personal contribution and measurable result?`,
    purpose: `Validate the résumé evidence for ${skill}.`
  }));
  missingRequired.slice(0, 2).forEach((skill) => questions.push({
    question: `This role uses ${skill}. What related experience would help you become productive with it?`,
    purpose: `Explore a stated evidence gap without assuming the candidate lacks the skill.`
  }));
  questions.push({
    question: `Describe the most difficult problem you solved in a role similar to ${role.title || "this one"}. How did you measure success?`,
    purpose: "Assess problem solving, ownership, and outcome orientation."
  });
  questions.push({
    question: "What would you aim to accomplish in your first 90 days in this role?",
    purpose: "Assess role understanding and planning."
  });
  const fallbackQuestions = [
    {
      question: "Walk me through a technical decision where you had to balance delivery speed, reliability, and maintainability.",
      purpose: "Assess engineering judgment and communication of tradeoffs."
    },
    {
      question: "Tell me about a production issue you investigated. How did you find the cause and prevent a recurrence?",
      purpose: "Assess debugging method, ownership, and learning."
    },
    {
      question: "Describe a disagreement with a teammate about implementation. How did the team reach a decision?",
      purpose: "Assess collaboration without relying on personality impressions."
    }
  ];
  for (const item of fallbackQuestions) {
    if (questions.length >= 5) break;
    questions.push(item);
  }

  return {
    candidate,
    score,
    recommendation,
    experienceYears,
    matchedRequired,
    missingRequired,
    matchedPreferred,
    skillEvidence,
    strengths,
    concerns,
    summary: `${candidate.name} matches ${matchedRequired.length} required and ${matchedPreferred.length} preferred skills. The score is an auditable evidence-match indicator, not a hiring decision.`,
    interviewQuestions: questions.slice(0, 5),
    analysisMode: "deterministic",
    fairnessNote: "Protected or personal characteristics were not used. A recruiter must review the original résumé and approve every decision."
  };
}

module.exports = {
  analyzeDeterministically,
  cleanText,
  containsSkill,
  estimateExperienceYears,
  extractCandidateInfo,
  parseSkillList,
  redactPersonalData
};
