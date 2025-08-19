const dayjs = require("dayjs");
const isBetween = require("dayjs/plugin/isBetween");

dayjs.extend(isBetween);

function shouldIncludeRecord(r, transactionDate, monthEnd, forDaily = false) {
  const balance = parseInt(r.Current_Balance || "0", 10);
  const statusDate = r.Status_Date ? dayjs(r.Status_Date, "YYYYMMDD") : null;
  const opened = r.Date_Account_Opened ? dayjs(r.Date_Account_Opened, "YYYYMMDD") : null;
  const transactDate = dayjs(transactionDate, "YYYYMMDD");

  if (forDaily) {
    // Only include if transaction (opened OR closed) happened within the last 2 days
    const twoDaysAgo = transactDate.subtract(2, "day");

    // Registration if opened within last 2 days
    const isRegistration = opened && opened.isBetween(twoDaysAgo, transactDate, "day", "[]");

    // Closure if closed (balance <= 0) AND status date within last 2 days
    const isClosure = balance <= 0 && statusDate && statusDate.isBetween(twoDaysAgo, transactDate, "day", "[]");

    if (isRegistration) return { include: true, type: "R" };
    if (isClosure) return { include: true, type: "C" };

    return { include: false };
  } else {
    // MONTHLY stays same...
    const monthEndDate = dayjs(monthEnd, "YYYYMMDD");
    const monthStartDate = monthEndDate.startOf("month");

    if (r.Status_Code === "C" && statusDate && statusDate.isBetween(monthStartDate, monthEndDate, "day", "[]")) {
      return { include: true, type: "D" };
    }
    if (opened && opened.isBetween(monthStartDate, monthEndDate, "day", "[]")) {
      return { include: true, type: "D" };
    }
    if (balance > 0) {
      return { include: true, type: "D" };
    }
    return { include: false };
  }
}

module.exports = { shouldIncludeRecord };
