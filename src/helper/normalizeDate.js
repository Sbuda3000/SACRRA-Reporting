const dayjs = require("dayjs");

function normalizeDate(input) {
  if (!input) return "00000000";

  // Bubble Date format "MM/DD/YYYY hh:mm A"
  const d = dayjs(input, "MM/DD/YYYY hh:mm A", true);

  if (d.isValid()) {
    return d.format("YYYYMMDD");
  }

  return "00000000"; // fallback
}

module.exports = { normalizeDate };