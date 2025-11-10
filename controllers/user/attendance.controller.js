const Attendance = require("../../models/user/attendance.model");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc.js");
const timezone = require("dayjs/plugin/timezone.js");

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = "Asia/Kolkata";

const clockIn = async (req, res) => {
  try {
    const employeeId = req.user.id;

    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    console.log(clientIp);

    return res.status(400).json(clientIp);

    // Current time in IST
    const now = dayjs().tz(TIMEZONE);

    // Define cut-offs in IST
    const fullDayCutOff = now.hour(10).minute(15).second(0).millisecond(0);
    const halfDayCutOff = now.hour(13).minute(30).second(60).millisecond(0);

    // Block attendance after 1:30 PM
    if (now.isAfter(halfDayCutOff)) {
      return res
        .status(400)
        .json({ message: "Clock-in not allowed after 1:30 PM" });
    }

    // Determine attendance status
    let attendanceStatus = "full-day";
    if (now.isAfter(fullDayCutOff) && now.isBefore(halfDayCutOff)) {
      attendanceStatus = "half-day";
    }

    // Today's date at midnight in IST
    const today = now.startOf("day").toDate();

    // Find existing attendance record
    let attendance = await Attendance.findOne({
      employee: employeeId,
      date: today,
    });

    if (!attendance) {
      // First clock-in of the day
      attendance = new Attendance({
        employee: employeeId,
        date: today,
        sessions: [{ clockIn: now.toDate() }],
        isWorking: true,
        status: attendanceStatus,
      });
    } else {
      const lastSession = attendance.sessions[attendance.sessions.length - 1];
      if (lastSession && !lastSession.clockOut) {
        return res
          .status(400)
          .json({ message: "Already clocked in, please clock out first" });
      }

      attendance.sessions.push({ clockIn: now.toDate() });
      attendance.isWorking = true;

      // Update status only if previously absent
      if (attendance.status === "absent") {
        attendance.status = attendanceStatus;
      }
    }

    await attendance.save();

    res.status(201).json({
      message: "Clock-in successful",
      attendance,
    });
  } catch (error) {
    console.error("Clock-in error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Clock Out
const clockOut = async (req, res) => {
  try {
    const employeeId = req.user.id;

    // Get today's date in IST
    const todayStart = dayjs().tz(TIMEZONE).startOf("day").toDate();

    // Find today's attendance
    let attendance = await Attendance.findOne({
      employee: employeeId,
      date: todayStart,
    });

    if (!attendance) {
      return res.status(404).json({ message: "No clock-in record found" });
    }

    const lastSession = attendance.sessions[attendance.sessions.length - 1];
    if (!lastSession || lastSession.clockOut) {
      return res
        .status(400)
        .json({ message: "No active session found to clock out" });
    }

    // Clock out in IST
    lastSession.clockOut = dayjs().tz(TIMEZONE).toDate();
    attendance.isWorking = false;

    // Calculate total work milliseconds
    let totalMs = 0;
    attendance.sessions.forEach((s) => {
      if (s.clockIn) {
        totalMs += dayjs(s.clockOut || dayjs().tz(TIMEZONE)).diff(
          dayjs(s.clockIn)
        );
      }
    });

    // Convert to hours
    const totalHours = totalMs / (1000 * 60 * 60);

    // Update status based on worked hours
    if (totalHours < 4) {
      attendance.status = "absent";
    } else if (totalHours >= 4 && totalHours < 7) {
      attendance.status = "half-day";
    } else if (totalHours >= 7) {
      attendance.status = "full-day";
    }

    await attendance.save();

    res.json({
      message: "Clock-out successful",
      attendance,
      totalHours: parseFloat(totalHours.toFixed(2)),
    });
  } catch (error) {
    console.error("Clock-out error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Get Today’s Attendance
const getTodayAttendance = async (req, res) => {
  try {
    const employeeId = req.user.id;

    // Get start and end of today in IST
    const todayStart = dayjs().tz(TIMEZONE).startOf("day").toDate();
    const todayEnd = dayjs().tz(TIMEZONE).endOf("day").toDate();

    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: todayStart, $lte: todayEnd }, // range query
    });

    if (!attendance) {
      return res.json({
        isWorking: false,
        totalWorkedSeconds: 0,
        lastAction: "Not working",
        firstClockIn: null,
        lastClockOut: null,
        workedHours: "00:00:00",
      });
    }

    const lastSession = attendance.sessions[attendance.sessions.length - 1];

    let totalMs = 0;
    attendance.sessions.forEach((s) => {
      if (s.clockIn) {
        totalMs += dayjs(s.clockOut || dayjs().tz(TIMEZONE)).diff(
          dayjs(s.clockIn)
        );
      }
    });

    const totalWorkedSeconds = Math.floor(totalMs / 1000);

    const firstClockIn =
      attendance.sessions.find((s) => s.clockIn)?.clockIn || null;
    const lastClockOut =
      [...attendance.sessions].reverse().find((s) => s.clockOut)?.clockOut ||
      null;

    const formatTime = (seconds) => {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(
        2,
        "0"
      )}:${String(secs).padStart(2, "0")}`;
    };

    const formatClockTime = (date) =>
      date ? dayjs(date).tz(TIMEZONE).format("HH:mm:ss") : null;

    res.json({
      isWorking: attendance.isWorking,
      totalWorkedSeconds,
      workedHours: formatTime(totalWorkedSeconds),
      firstClockIn: formatClockTime(firstClockIn),
      lastClockOut: formatClockTime(lastClockOut),
      lastAction: lastSession?.clockIn
        ? lastSession.clockOut
          ? `Clocked out at ${formatClockTime(lastSession.clockOut)}`
          : `Clocked in at ${formatClockTime(lastSession.clockIn)}`
        : "Not working",
    });
  } catch (err) {
    console.error("Get today attendance error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all monthly attendance
const getMonthlyAttendance = async (req, res) => {
  try {
    const { year, month } = req.query; // month: 1-12
    const employeeId = req.user.id;

    if (!year || !month) {
      return res.status(400).json({ message: "Year and month are required" });
    }

    // Create string for first day of month: 'YYYY-MM-DD'
    const startString = `${year}-${String(month).padStart(2, "0")}-01`;

    // Start and end of month in IST
    const startDate = dayjs.tz(startString, TIMEZONE).startOf("day").toDate();

    const endDate = dayjs(startDate)
      .tz(TIMEZONE)
      .endOf("month")
      .endOf("day")
      .toDate();

    const records = await Attendance.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate },
    }).lean();

    // Format attendance map with correct day in IST
    const attendanceMap = {};
    records.forEach((r) => {
      const day = dayjs(r.date).tz(TIMEZONE).date();
      attendanceMap[day] = {
        status: r.status,
        totalWorkHours: r.totalWorkHours,
      };
    });

    res.json({ year, month, attendance: attendanceMap });
  } catch (err) {
    console.error("Monthly attendance fetch error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Get All Attendance (Admin/HR)
const getAllAttendance = async (req, res) => {
  try {
    const attendances = await Attendance.find()
      .populate("employee", "employeeId name email department role")
      .sort({ date: -1 });

    res.json({ attendances });
  } catch (error) {
    console.error("Get all attendance error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  clockIn,
  clockOut,
  getTodayAttendance,
  getAllAttendance,
  getMonthlyAttendance,
};
