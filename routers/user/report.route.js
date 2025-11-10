const express = require("express");
const authMiddleware = require("../../middleware/auth.middleware");
const {
  createReport,
  getReportsByUserIdSorted,
} = require("../../controllers/user/report.controller");

const router = express.Router();

router.route("/new-report").post(authMiddleware, createReport);
router.get("/get-all-reports", authMiddleware, getReportsByUserIdSorted);
// router.get("/attendance/month", authMiddleware, getMonthlyAttendance);

module.exports = router;
