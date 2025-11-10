const Report = require("../../models/user/report.model");

// Create a new report
const createReport = async (req, res) => {
  try {
    const { documentType, message } = req.body;

    const userId = req.user.id;

    if (!documentType || !message) {
      return res.status(400).json({
        success: false,
        message: "Both documentType and message are required.",
      });
    }

    const report = new Report({
      userId,
      documentType,
      message,
    });

    await report.save();
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get a single report by ID
const getReportsByUserIdSorted = async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await Report.find({ userId }).sort({ sentAt: -1 });
    res.status(200).json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a report
const deleteReport = async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);

    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Report deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createReport, getReportsByUserIdSorted, deleteReport };
