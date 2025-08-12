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

// pad helper: left (default) or right
function pad(value, length, padChar = " ", align = "left") {
  const str = (value === undefined || value === null) 
    ? "" 
    : value.toString().replace(/[\r\n]/g, ""); // remove CR/LF completely
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
  const headerLine = "H" +
    pad(SUPPLIER_REF, 10, " ", "right") + // positions 2–11
    pad(monthEnd, 8, "0") +               // positions 12–19
    "06" +                                // positions 20–21
    pad(creationDate, 8, "0") +           // positions 22–29
    pad(BRAND_NAME, 60) +                 // positions 30–89
    pad("", 631);                         // remaining positions to reach 720

  if (headerLine.length !== 720) {
    throw new Error(`Header length is ${line.length}, expected 720`);
  }  
  return headerLine;
}

function buildTrailer(count) {
  const line =
    "T" +
    pad(count, 9, "0", "right") + // positions 2–10
    pad("", 710);                 // remaining positions to reach 720

  if (line.length !== 720) {
    throw new Error(`Trailer length is ${line.length}, expected 720`);
  }
  return line;
}

/**
 * buildDataLine: Accepts a dataIndicator (1 char)
 * - For monthly rows pass 'D'
 * - For daily rows pass 'R' (registration) or 'C' (closure)
 */
function buildDataLine(r, dataIndicator = "D") {
  r.dateaccountopened_text = normalizeDate(r["Created Date"])

  if (typeof(r.sa_id_number) !== "undefined") {
    return (
      pad(dataIndicator, 1) +
      pad(r.sa_id_number, 13, "0", "right") +
      pad(r.non_sa_id_text, 16) +
      pad(r.gender_text, 1) +
      pad(r.dateofbirth_text, 8) +
      pad(r.branchcode_text, 8) +
      pad(r.accountnumber_text, 25) +
      pad(r.subaccountnumber_text, 4) +
      pad(r.surname_text, 25) +
      pad(r.title_text, 5) +
      pad(r.forename1_text, 14) +
      pad(r.forename2_text, 14) +
      pad(r.forename3_text, 14) +
      pad(r.addressline1_text, 25) +
      pad(r.addressline2_text, 25) +
      pad(r.addressline3_text, 25) +
      pad(r.addressline4_text, 25) +
      pad(r.addresspostalcode_number, 6) +
      pad(r.ownerortenant_text, 1) +
      pad(r.postaladdressline1_text, 25) +
      pad(r.postaladdressline2_text, 25) +
      pad(r.postaladdressline3_text, 25) +
      pad(r.postaladdreslines4_text, 25) +
      pad(r.postalcode_number, 6) +
      pad(r.ownershiptype_text, 2) +
      pad(r.loanreasoncode_text, 2) +
      pad(r.paymenttype_text, 2) +
      pad("M", 2) + // Type of Account
      pad(r.dateaccountopened_text, 8) +
      pad(r.deferredpaymentdate || "00000000", 8) +
      pad(r.lastpaymentdate_number || "00000000", 8) +
      pad(r.openingbalance_number || "0", 9, "0", "right") +
      pad(r.currentbalance_number || "0", 9, "0", "right") +
      pad(r.currentbalanceindicator_number, 1) +
      pad(r.amountoverdue_number || "0", 9, "0", "right") +
      pad(r.installmentamount_number || "0", 9, "0", "right") +
      pad(r.monthsinarrears_number || "00", 2, "0", "right") +
      pad(r.statuscode_text, 2) +
      pad(r.repaymentfrequency_text || "00", 2) +
      pad(r.terms_text || "0000", 4) +
      pad(r.statusdate_text || "00000000", 8) +
      pad(r.oldsupplierbranchcode_text, 8) +
      pad(r.oldaccountnumber_text, 25) +
      pad(r.oldsubaccountnumber_text, 4) +
      pad(r.oldsupplierreferencenumber_text, 10) +
      pad(r.hometelephone_text, 16) +
      pad(r.cellphonenumber_number, 16) +
      pad(r.employerphone_number, 16) +
      pad(r.employername_text, 60) +
      pad(r.income_number || "0", 9, "0", "right") +
      pad(r.incomefrequency_text, 1) +
      pad(r.occupation_text, 20) +
      pad(r.thirdpartyname_text, 60) +
      pad(r.accountsoldtothirdparty_text || "00", 2) +
      pad(r.numberofparticipantsinjointloan_number || "000", 3) +
      pad("", 2) // filler
    );
  }

}

// validator: ensures ASCII & consistent line lengths
function validateFileLines(lines) {
  const expectedLength = 720;
  if (!lines || lines.length === 0) throw new Error("Empty file");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln === "") continue;
    if (!/^[\x00-\x7F]*$/.test(ln)) throw new Error(`Non-ASCII characters found at line ${i + 1}`);
    if (ln.length !== expectedLength) {
      throw new Error(`Line ${i + 1} length (${ln.length}) != expected ${expectedLength}`);
    }
  }
}

// small enrich / clean
function enrichFields(r) {
  r.dateaccountopened_text = normalizeDate(r["Created Date"]);
  r.lastpaymentdate_number = normalizeDate(r.lastpaymentdate_number);
  r.statusdate_text = r.statusdate_text ? normalizeDate(r.statusdate_text) : "00000000";

  // status date required when status is C, T, V
  const code = r.statuscode_text || "";
  if (["C", "T", "V"].includes(code)) {
    r.statusdate_text = r.lastpaymentdate_number || r.statusdate_text || dayjs().format("YYYYMMDD");
  } else {
    r.statusdate_text = "00000000";
  }

  const months = parseInt(r.monthsinarrears_number || "0", 10);
  r.amountoverdue_number = months > 0 ? (r.amountoverdue_number || "0") : "0";

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
 *   * Registration (R): dateaccountopened_text within last 48 hours (transaction date window)
 *   * Closure (C): current_balance <= 0
 * - Only includes records that qualify as R or C in the daily output (the spec expects daily files to contain registrations & closures).
 * - Appends supplier ref and transaction date (positions 701-718) as required for daily layout.
 */
function buildDailyLine(r, transactionDate) {
  console.log("Transaction Date and r: ", r, transactionDate)
  enrichFields(r);

  const today = dayjs(transactionDate, "YYYYMMDD");
  // registration if opening date within last 48 hours of transactionDate
  const opened = r.dateaccountopened_text && r.dateaccountopened_text !== "00000000" ? dayjs(r.dateaccountopened_text, "YYYYMMDD") : null;
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
  if (isClosure && !r.statuscode_text) r.statuscode_text = "C";
  if (isClosure && (!r.statusdate_text || r.statusdate_text === "00000000")) r.statusdate_text = r.lastpaymentdate_number || dayjs().format("YYYYMMDD");

  const dataLine = buildDataLine(r, dataIndicator);
  // Append supplier ref (pos 701-710) and transaction date (pos 711-718)
  return dataLine + pad(SUPPLIER_REF, 10, " ", "right") + pad(transactionDate, 8, "0", "right");
}

function groupByAccount(records) {
  const grouped = {};
  records.forEach((r) => {
    const acc = r.account_number;
    // keep record with latest statusdate_text if multiple
    if (!grouped[acc] || (r.statusdate_text && r.statusdate_text > grouped[acc].statusdate_text)) {
      grouped[acc] = r;
    }
  });
  return Object.values(grouped);
}

async function generate(tableName, monthEndDate, type = "daily") {
  const today = dayjs().format("YYYYMMDD");
  const monthEnd = monthEndDate != "" ? monthEndDate : dayjs().endOf("month").format("YYYYMMDD");

  const response = await axios.get(`${BUBBLE_API_URL}${tableName}`, {
    headers: { Authorization: `Bearer ${BUBBLE_API_KEY}` }
  });

  let results = response.data.response.results || [];
  const outputFiles = [];

  // DAILY
  if (type === "daily" || type === "both") {
    const dailyLines = [];
    for (const r of results) {
      const line = buildDailyLine(r, today);
      console.log("Daily lines :", line)
      if (line) dailyLines.push(line);
    }

    if (dailyLines.length > 0) {
      const dailyFile = `${SUPPLIER_REF}_ALL_L702_D_${today}_1_1.txt`;
      fs.writeFileSync(`/tmp/${dailyFile}`, dailyLines.join("\r\n"), "ascii");

      // validation: each line must be same length and ASCII
      //const lines = fs.readFileSync(`/tmp/${dailyFile}`, "ascii").split(/\r?\n/);
      //validateFileLines(lines);

      outputFiles.push(`/tmp/${dailyFile}`);
    } else {
      // no daily rows to write - this is ok, return empty list (caller decides)
      console.warn("No daily registrations/closures found for date", today);
    }
  }

  // MONTHLY
  if (type === "monthly" || type === "both") {
    const grouped = groupByAccount(results);
    const headerLine = buildHeader(monthEnd, today);
    console.log("HEADER length:", headerLine.length, JSON.stringify(headerLine));
    const monthly = [
      headerLine,
      ...grouped.map((r) => {
        enrichFields(r);
        return buildDataLine(r, "D");
      }),
      buildTrailer(grouped.length + 2)
    ];

    const monthlyFile = `${SUPPLIER_REF}_ALL_L702_M_${monthEnd}_1_1.txt`;
    fs.writeFileSync(`/tmp/${monthlyFile}`, monthly.join("\r\n"), "ascii");

    const lines = fs.readFileSync(`/tmp/${monthlyFile}`, "ascii").split(/\r?\n/);
    console.log("Monthly line: ", lines)
    //svalidateFileLines(lines);

    outputFiles.push(`/tmp/${monthlyFile}`);
  }

  return outputFiles;
}

module.exports = { generate };
