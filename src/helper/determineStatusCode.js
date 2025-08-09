const dayjs = require("dayjs");

const ALLOWED = new Set(["C","D","E","L","T","V","W","Z"]);

/**
 * Mutates record `r` by setting r.status_code and r.status_date where applicable.
 * Returns the status code (string) or "".
 */
function determineStatusCode(r = {}) {
  // Normalize helper: returns 'YYYYMMDD' or '00000000'
  function normDate(d) {
    if (!d) return "00000000";
    const known = dayjs(d, ["YYYYMMDD", "YYYY-MM-DD", "DD/MM/YYYY"], true);
    if (known.isValid()) return known.format("YYYYMMDD");
    const loose = dayjs(d);
    return loose.isValid() ? loose.format("YYYYMMDD") : "00000000";
  }

  // If incoming override or a valid incoming status_code exists, accept it.
  const incoming = (r.status_override || r.status_code || "").toString().trim().toUpperCase();
  if (incoming && ALLOWED.has(incoming)) {
    r.status_code = incoming;
    r.status_date = normDate(r.status_date || r.last_payment_date || dayjs().format("YYYYMMDD"));
    if (["C","T","V"].includes(incoming)) r.months_in_arrears = "00";
    return incoming;
  }

  // Explicit flags mapping (highest precedence)
  if (r.deceased_flag || r.status_flag === "Z") {
    r.status_code = "Z";
    r.status_date = normDate(r.status_date || r.last_payment_date || dayjs().format("YYYYMMDD"));
    return "Z";
  }
  if (r.handed_over_flag || r.status_flag === "L") {
    r.status_code = "L";
    r.status_date = normDate(r.status_date || r.last_payment_date || dayjs().format("YYYYMMDD"));
    return "L";
  }
  if (r.written_off_flag || r.status_flag === "W") {
    r.status_code = "W";
    r.status_date = normDate(r.status_date || r.last_payment_date || dayjs().format("YYYYMMDD"));
    return "W";
  }
  if (r.disputed_flag || r.status_flag === "D") {
    r.status_code = "D";
    r.status_date = normDate(r.status_date || dayjs().format("YYYYMMDD"));
    return "D";
  }
  if (r.terms_extended_flag || r.status_flag === "E") {
    r.status_code = "E";
    r.status_date = normDate(r.status_date || dayjs().format("YYYYMMDD"));
    return "E";
  }

  // Parse numeric/date fields safely
  const balance = parseInt((r.current_balance || "0").toString().replace(/\D/g, ""), 10) || 0;
  const installment = parseInt((r.installment_amount || "0").toString().replace(/\D/g, ""), 10) || 0;
  const months = parseInt((r.months_in_arrears || "0").toString().replace(/\D/g, ""), 10) || 0;

  const openedStr = normDate(r.date_account_opened);
  const lastPayStr = normDate(r.last_payment_date);
  const opened = openedStr !== "00000000" ? dayjs(openedStr, "YYYYMMDD") : null;
  const lastPay = lastPayStr !== "00000000" ? dayjs(lastPayStr, "YYYYMMDD") : null;

  // Closed (fully paid)
  if (balance <= 0) {
    r.status_code = "C";
    r.status_date = normDate(r.last_payment_date || dayjs().format("YYYYMMDD"));
    r.months_in_arrears = "00";
    return "C";
  }

  // Cooling-off settlement V: paid within 5 days of opening and balance <= installment
  if (opened && lastPay && installment > 0 && balance <= installment && lastPay.diff(opened, "day") <= 5) {
    r.status_code = "V";
    r.status_date = normDate(r.last_payment_date || dayjs().format("YYYYMMDD"));
    r.months_in_arrears = "00";
    return "V";
  }

  // Early settlement T: paid within 30 days and balance <= installment
  if (opened && lastPay && installment > 0 && balance <= installment && lastPay.diff(opened, "day") < 30) {
    r.status_code = "T";
    r.status_date = normDate(r.last_payment_date || dayjs().format("YYYYMMDD"));
    r.months_in_arrears = "00";
    return "T";
  }

  // Long arrears inference
  if (months >= 6) {
    if (r.handed_over_flag) {
      r.status_code = "L";
      r.status_date = normDate(r.status_date || r.last_payment_date || dayjs().format("YYYYMMDD"));
      return "L";
    }
    if (r.written_off_flag || r.defaulted_flag || (r.recovery_action === "written_off")) {
      r.status_code = "W";
      r.status_date = normDate(r.status_date || r.last_payment_date || dayjs().format("YYYYMMDD"));
      return "W";
    }
  }

  // No status could be inferred
  r.status_code = "";
  return "";
}

module.exports = { determineStatusCode };
