const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);

const { normalizeDate } = require("./normalizeDate");

function enrichFields(r) {
  // Created Date from Bubble
  r.Date_Account_Opened = normalizeDate(r["Created Date"]);

  // Last payment from Bubble
  r.Last_Payment_Date = normalizeDate(r.Last_Payment_Date);

  // If status requires a date, supply it sensibly
  const code = r.Status_Code;
  if (["C", "T", "V"].includes(code)) {
    r.Status_Date = normalizeDate(r.Status_Date);
    if (r.Status_Date === "00000000") {
      // Prefer the actual last payment date from Bubble, else today
      r.Status_Date = r.Last_Payment_Date !== "00000000"
        ? r.Last_Payment_Date
        : dayjs().utc().format("YYYYMMDD");
    }
    // Close-out numeric fields
    r.Installment_Amount = "0";
    r.Amount_Overdue = "0";
    r.Opening_Balance = " ";
  } else {
    // Only zero out if there isn't a real status date
    r.Status_Date = normalizeDate(r.Status_Date);
    if (r.Status_Date === "19700101") r.Status_Date = "00000000"; // extra guard if epoch sneaks in
  }

  // Check Months in arrears and make sure to assign amount overdue
  const months = parseInt(r.Months_In_Arrears, 10);
  r.Amount_Overdue = Number.isFinite(months) && months > 0 ? r.Opening_Balance : "0";

  // If there was no last payment yet
  if (r.Last_Payment_Date === "00000000") {
    r.Current_Balance = r.Opening_Balance;
    r.Installment_Amount = r.Opening_Balance;
  }

  // sanitize strings
  for (const k of Object.keys(r)) {
    if (typeof r[k] === "string") {
      r[k] = r[k].replace(/\r?\n/g, " ").replace(/\|/g, "").trim();
    }
  }
  return r;
}

module.exports = { enrichFields };
