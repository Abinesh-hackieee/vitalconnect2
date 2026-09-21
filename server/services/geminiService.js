const { GoogleGenerativeAI } = require('@google/generative-ai');

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    return new GoogleGenerativeAI(apiKey);
  } catch (err) {
    console.error('Error initializing GoogleGenerativeAI:', err.message);
    return null;
  }
};

/**
 * Generate AI-assisted emergency triage assessment and guidance
 */
const getEmergencyTriageAdvice = async (requestData) => {
  const genAI = getGeminiClient();
  const fallbackAdvice = {
    urgencySummary: `Urgent request for ${requestData.unitsRequired} unit(s) of ${requestData.bloodGroup} blood at ${requestData.hospitalName}.`,
    immediateSteps: [
      'Ensure the hospital blood bank has confirmed the cross-matching sample.',
      'Keep the emergency contact line open for incoming calls from accepted donors.',
      'Coordinate with hospital emergency staff upon donor arrival.',
    ],
    compatibilityNote: `Donors with blood groups compatible with ${requestData.bloodGroup} are being notified in the ${requestData.hospitalLocation} region.`,
    disclaimer: 'Vital Connect connects volunteers; verify all requirements with hospital medical staff.',
  };

  if (!genAI) {
    return fallbackAdvice;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are the Vital Connect medical triage assistant. An emergency blood request has been created:
Patient: ${requestData.patientName}
Blood Group Required: ${requestData.bloodGroup}
Units: ${requestData.unitsRequired}
Hospital: ${requestData.hospitalName}, ${requestData.hospitalLocation}
Urgency Level: ${requestData.urgencyLevel}
Description: ${requestData.description || 'Not provided'}

Provide a brief, compassionate, and actionable 3-point emergency guidance in JSON format:
{
  "urgencySummary": "short 1 sentence summary",
  "immediateSteps": ["step 1", "step 2", "step 3"],
  "compatibilityNote": "short sentence explaining which blood groups can help",
  "disclaimer": "platform disclaimer"
}
Output strictly valid JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (err) {
    console.warn('[Gemini Service] Fallback used:', err.message);
    return fallbackAdvice;
  }
};

/**
 * Generate a clear and urgent notification message for registered donors
 */
const generateDonorBroadcastMessage = async (requestData) => {
  return `🚨 URGENT BLOOD NEED: ${requestData.unitsRequired} Unit(s) of ${requestData.bloodGroup} blood urgently needed at ${requestData.hospitalName}, ${requestData.hospitalLocation}. Urgency: ${requestData.urgencyLevel}. If you are available to donate, please accept immediately.`;
};

module.exports = {
  getEmergencyTriageAdvice,
  generateDonorBroadcastMessage,
};
