"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeDeterministically,
  containsSkill,
  estimateExperienceYears,
  extractCandidateInfo,
  parseSkillList,
  redactPersonalData
} = require("../src/analysis");

test("skill lists are trimmed and de-duplicated", () => {
  assert.deepEqual(parseSkillList("Node.js, PostgreSQL; Node.js\nGit"), ["Node.js", "PostgreSQL", "Git"]);
});

test("skill matching respects token boundaries and punctuation", () => {
  assert.equal(containsSkill("Built Node.js REST APIs using C++.", "Node.js"), true);
  assert.equal(containsSkill("Built Node.js REST APIs using C++.", "C++"), true);
  assert.equal(containsSkill("Managed ongoing projects.", "Go"), false);
});

test("candidate contact information and experience are extracted", () => {
  const resume = "Jordan Lee\njordan@example.com\n5 years of professional experience\nEngineer 2021 - Present";
  assert.equal(extractCandidateInfo(resume).name, "Jordan Lee");
  assert.equal(extractCandidateInfo(resume).email, "jordan@example.com");
  assert.ok(estimateExperienceYears(resume) >= 5);
});

test("personal details are redacted before AI enrichment", () => {
  const resume = "Jordan Lee\njordan@example.com\n+91 98765 43210\nDate of birth: 1995\nNode.js engineer";
  const redacted = redactPersonalData(resume, "Jordan Lee");
  assert.equal(redacted.includes("jordan@example.com"), false);
  assert.equal(redacted.includes("98765"), false);
  assert.equal(redacted.includes("1995"), false);
  assert.equal(redacted.includes("Jordan Lee"), false);
  assert.match(redacted, /Node\.js engineer/);
});

test("strong sample receives explainable evidence and five questions", () => {
  const sample = fs.readFileSync(path.join(__dirname, "../public/samples/asha-sharma.txt"), "utf8");
  const result = analyzeDeterministically({
    text: sample,
    filename: "asha-sharma.txt",
    role: {
      title: "Backend Engineer",
      minExperience: 3,
      requiredSkills: "Node.js, PostgreSQL, REST APIs, Git",
      preferredSkills: "AWS, Docker, TypeScript"
    }
  });

  assert.equal(result.candidate.name, "Asha Sharma");
  assert.equal(result.recommendation, "strong_fit");
  assert.equal(result.experienceYears, 5);
  assert.equal(result.matchedRequired.length, 4);
  assert.equal(result.missingRequired.length, 0);
  assert.equal(result.interviewQuestions.length, 5);
  assert.ok(result.score >= 90);
});

test("unmatched candidate stays in review instead of being auto-rejected", () => {
  const result = analyzeDeterministically({
    text: "Taylor Singh\ntaylor@example.com\nFour years producing marketing reports with Excel and Tableau for retail teams.",
    filename: "taylor.txt",
    role: {
      title: "Backend Engineer",
      minExperience: 3,
      requiredSkills: "Node.js, PostgreSQL, REST APIs, Git",
      preferredSkills: "AWS, Docker"
    }
  });
  assert.equal(result.recommendation, "review");
  assert.equal(result.missingRequired.length, 4);
  assert.doesNotMatch(result.summary, /reject/i);
});
