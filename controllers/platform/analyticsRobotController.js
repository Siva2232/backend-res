const {
  buildPlatformSnapshot,
  answerQuestion,
  SUGGESTED_QUESTIONS,
  SUGGESTED_QUESTION_CATEGORIES,
} = require("../../services/platform/analyticsRobotService");

const getSnapshot = async (req, res) => {
  try {
    const snapshot = await buildPlatformSnapshot();
    res.json({
      snapshot,
      suggestedQuestions: SUGGESTED_QUESTIONS,
      questionCategories: SUGGESTED_QUESTION_CATEGORIES,
      totalQuestions: SUGGESTED_QUESTIONS.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const askRobot = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ message: "Question is required" });
    }

    const snapshot = await buildPlatformSnapshot();
    const result = answerQuestion(question, snapshot);

    res.json({
      question: String(question).trim(),
      answer: result.answer,
      intent: result.intent,
      highlights: result.highlights || [],
      snapshot,
      generatedAt: snapshot.generatedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSnapshot, askRobot };
