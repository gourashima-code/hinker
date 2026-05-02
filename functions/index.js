const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions }   = require("firebase-functions/v2");
const Anthropic               = require("@anthropic-ai/sdk");

setGlobalOptions({ region: "europe-west1" });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Callable: scoreMatch
 * Input:  { user: {jobTitle, skills, location, radius}, job: {company, industry, hiring, location, salary, workType} }
 * Output: { score: number, reason: string }
 */
exports.scoreMatch = onCall({ enforceAppCheck: false }, async (req) => {
  // Must be signed-in
  if (!req.auth) throw new HttpsError("unauthenticated", "Login erforderlich.");

  const { user, job } = req.data;
  if (!user || !job) throw new HttpsError("invalid-argument", "user und job erforderlich.");

  const prompt =
    `Job-Match 0-100.\n` +
    `Kandidat: ${user.jobTitle||"?"}, Skills: ${user.skills||"keine"}, Standort: ${user.location||"?"}, Radius: ${user.radius||"25 km"}\n` +
    `Stelle: ${job.company}, ${job.industry}, sucht: ${job.hiring}, Standort: ${job.location||"?"}, Gehalt: ${job.salary||"k.A."}, Modell: ${job.workType||"?"}\n` +
    `Nur JSON (kein Markdown): {"score":75,"reason":"Max 10 Wörter Deutsch"}`;

  try {
    const msg = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 120,
      messages:   [{ role: "user", content: prompt }],
    });
    const text = msg.content.map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("scoreMatch error:", e);
    throw new HttpsError("internal", "Scoring fehlgeschlagen.");
  }
});
