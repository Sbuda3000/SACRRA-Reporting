require('dotenv').config();

const fs = require("fs");
const axios = require("axios");
const dayjs = require("dayjs");

//const { determineStatusCode } = require("./helper/determineStatusCode");

const {
  BUBBLE_API_URL,
  BUBBLE_API_KEY,
  SUPPLIER_REF,
  BRAND_NAME
} = process.env;


console.log(BUBBLE_API_KEY)

// pad helper: left (default) or right
function pad(value, length, padChar = " ", align = "left") {
  const str = (value === undefined || value === null) ? "" : value.toString();
  if (align === "left") return str.padEnd(length, padChar).substring(0, length);
  return str.padStart(length, padChar).substring(0, length);
}

function normalizeDate(d) {
  if (!d) return "00000000";
  const known = dayjs(d, ["YYYYMMDD", "YYYY-MM-DD", "DD/MM/YYYY"], true);
  if (known.isValid()) return known.format("YYYYMMDD");
  const loose = dayjs(d);
  return loose.isValid() ? loose.format("YYYYMMDD") : "00000000";
}

function buildHeader(monthEnd, creationDate) {
  return (
    "H" +
    pad(SUPPLIER_REF, 10, " ", "right") +
    pad(monthEnd, 8, "0") +
    "06" +
    pad(creationDate, 8, "0") +
    pad(BRAND_NAME, 60) +
    pad("", 611)
  );
}

function buildTrailer(count) {
  return "T" + pad(count, 9, "0", "right") + pad("", 690);
}

/**
 * buildDataLine: Accepts a dataIndicator (1 char)
 * - For monthly rows pass 'D'
 * - For daily rows pass 'R' (registration) or 'C' (closure)
 */
function buildDataLine(r, dataIndicator = "D") {
  return (
    pad(dataIndicator, 1) +
    pad(r.sa_id, 13, "0", "right") +
    pad(r.non_sa_id || "", 16) +
    pad(r.gender || "", 1) +
    pad(r.date_of_birth || "", 8) +
    pad(r.branch_code || "", 8) +
    pad(r.account_number || "", 25) +
    pad(r.sub_account_number || "", 4) +
    pad(r.surname || "", 25) +
    pad(r.title || "", 5) +
    pad(r.first_name || "", 14) +
    pad(r.middle_name || "", 14) +
    pad(r.third_name || "", 14) +
    pad(r.res_address1 || "", 25) +
    pad(r.res_address2 || "", 25) +
    pad(r.res_address3 || "", 25) +
    pad(r.res_address4 || "", 25) +
    pad(r.res_postal_code || "", 6) +
    pad(r.tenant_type || "", 1) +
    pad(r.post_address1 || "", 25) +
    pad(r.post_address2 || "", 25) +
    pad(r.post_address3 || "", 25) +
    pad(r.post_address4 || "", 25) +
    pad(r.post_postal_code || "", 6) +
    pad(r.ownership || "", 2) +
    pad(r.loan_reason || "", 2) +
    pad(r.payment_type || "", 2) +
    pad("M", 2) + // TYPE OF ACCOUNT - Force M for Account Type M
    pad(r.date_account_opened || "", 8) +
    pad(r.deferred_payment_date || "00000000", 8) +
    pad(r.last_payment_date || "00000000", 8) +
    pad(r.opening_balance || "0", 9, "0", "right") +
    pad(r.current_balance || "0", 9, "0", "right") +
    pad(r.current_balance_indicator || "", 1) +
    pad(r.amount_overdue || "0", 9, "0", "right") +
    pad(r.installment_amount || "0", 9, "0", "right") +
    pad(r.months_in_arrears || "00", 2, "0", "right") +
    pad(r.status_code || "", 2) +
    pad(r.repayment_frequency || "00", 2) +
    pad(r.terms || "0000", 4) +
    pad(r.status_date || "00000000", 8) +
    pad(r.old_branch_code || "", 8) +
    pad(r.old_account_number || "", 25) +
    pad(r.old_sub_account_number || "", 4) +
    pad(r.old_supplier_ref || "", 10) +
    pad(r.tel_home || "", 16) +
    pad(r.tel_cell || "", 16) +
    pad(r.tel_work || "", 16) +
    pad(r.employer || "", 60) +
    pad(r.income || "0", 9, "0", "right") +
    pad(r.income_frequency || "", 1) +
    pad(r.occupation || "", 20) +
    pad(r.third_party_name || "", 60) +
    pad(r.account_sold || "00", 2) +
    pad(r.no_of_participants || "000", 3) +
    pad("", 2)
  );
}

// validator: ensures ASCII & consistent line lengths
function validateFileLines(lines) {
  if (!lines || lines.length === 0) throw new Error("Empty file");
  const length = lines[0].length;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // skip possible trailing blank line
    if (ln === "") continue;
    if (!/^[\x00-\x7F]*$/.test(ln)) throw new Error(`Non-ASCII characters found at line ${i+1}`);
    if (ln.length !== length) throw new Error(`Line ${i+1} length (${ln.length}) != expected ${length}`);
  }
}

// small enrich / clean
function enrichFields(r) {
  r.date_account_opened = normalizeDate(r.date_account_opened);
  r.last_payment_date = normalizeDate(r.last_payment_date);
  r.status_date = r.status_date ? normalizeDate(r.status_date) : "00000000";

  // status date required when status is C, T, V
  const code = r.status_code || "";
  if (["C", "T", "V"].includes(code)) {
    r.status_date = r.last_payment_date || r.status_date || dayjs().format("YYYYMMDD");
  } else {
    r.status_date = "00000000";
  }

  const months = parseInt(r.months_in_arrears || "0", 10);
  r.amount_overdue = months > 0 ? (r.amount_overdue || "0") : "0";

  // Force account type M in field (positions 368-369)
  r.type_of_account = "M";

  // sanitize strings
  for (const k of Object.keys(r)) {
    if (typeof r[k] === "string") {
      r[k] = r[k].replace(/\r?\n/g, " ").replace(/\|/g, "").trim();
    }
  }
  return r;
}

/**
 * buildDailyLine:
 * - determines if record is a registration (R) or closure (C) per Layout 700v2:
 *   * Registration (R): date_account_opened within last 48 hours (transaction date window)
 *   * Closure (C): current_balance <= 0
 * - Only includes records that qualify as R or C in the daily output (the spec expects daily files to contain registrations & closures).
 * - Appends supplier ref and transaction date (positions 701-718) as required for daily layout.
 */
function buildDailyLine(r, transactionDate) {
  enrichFields(r);

  const today = dayjs(transactionDate, "YYYYMMDD");
  // registration if opening date within last 48 hours of transactionDate
  const opened = r.date_account_opened && r.date_account_opened !== "00000000" ? dayjs(r.date_account_opened, "YYYYMMDD") : null;
  const isRegistration = opened ? Math.abs(today.diff(opened, "hour")) <= 48 : false;

  // closure if balance <= 0
  const balance = parseInt(r.current_balance || "0", 10);
  const isClosure = balance <= 0;

  let dataIndicator = "";
  if (isRegistration) dataIndicator = "R";
  else if (isClosure) dataIndicator = "C";
  else {
    // per layout: daily files are for registrations and closures; skip other records
    return null;
  }

  // For closures we expect a status code and status date; ensure enrichFields set them if needed
  if (isClosure && !r.status_code) r.status_code = "C";
  if (isClosure && (!r.status_date || r.status_date === "00000000")) r.status_date = r.last_payment_date || dayjs().format("YYYYMMDD");

  const dataLine = buildDataLine(r, dataIndicator);
  // Append supplier ref (pos 701-710) and transaction date (pos 711-718)
  return dataLine + pad(SUPPLIER_REF, 10, " ", "right") + pad(transactionDate, 8, "0", "right");
}

function groupByAccount(records) {
  const grouped = {};
  records.forEach((r) => {
    const acc = r.account_number;
    // keep record with latest status_date if multiple
    if (!grouped[acc] || (r.status_date && r.status_date > grouped[acc].status_date)) {
      grouped[acc] = r;
    }
  });
  return Object.values(grouped);
}

async function generate(tableName, type = "daily") {
  const today = dayjs().format("YYYYMMDD");
  const monthEnd = dayjs().endOf("month").format("YYYYMMDD");

  const response = await axios.get(`${BUBBLE_API_URL}${tableName}`, {
    headers: { Authorization: `Bearer ${BUBBLE_API_KEY}` }
  });

  let results = response.data.response.results || [];
  console.log(results)
  const outputFiles = [];

  // DAILY
  if (type === "daily" || type === "both") {
    const dailyLines = [];
    for (const r of results) {
      const line = buildDailyLine(r, today);
      if (line) dailyLines.push(line);
    }

    if (dailyLines.length > 0) {
      const dailyFile = `${SUPPLIER_REF}_ALL_L702_D_${today}_1_1.txt`;
      fs.writeFileSync(`/tmp/${dailyFile}`, dailyLines.join("\r\n"), "ascii");

      // validation: each line must be same length and ASCII
      const lines = fs.readFileSync(`/tmp/${dailyFile}`, "ascii").split(/\r?\n/);
      validateFileLines(lines);

      outputFiles.push(`/tmp/${dailyFile}`);
    } else {
      // no daily rows to write - this is ok, return empty list (caller decides)
      console.warn("No daily registrations/closures found for date", today);
    }
  }

  // MONTHLY
  if (type === "monthly" || type === "both") {
    const grouped = groupByAccount(results);
    const monthly = [
      buildHeader(monthEnd, today),
      ...grouped.map((r) => {
        
        //determineStatusCode(r); 
        enrichFields(r);
        return buildDataLine(r, "D");
      }),
      buildTrailer(grouped.length + 2)
    ];
    const monthlyFile = `${SUPPLIER_REF}_ALL_L702_M_${monthEnd}_1_1.txt`;
    fs.writeFileSync(`/tmp/${monthlyFile}`, monthly.join("\r\n"), "ascii");

    const lines = fs.readFileSync(`/tmp/${monthlyFile}`, "ascii").split(/\r?\n/);
    validateFileLines(lines);

    outputFiles.push(`/tmp/${monthlyFile}`);
  }

  return outputFiles;
}

generate("sacrra_account", "both");

module.exports = { generate };
