const fs = require("fs");
const axios = require("axios");
const dayjs = require("dayjs");
const dotenv = require("dotenv");
const { execSync } = require("child_process");

dotenv.config();

const {
  BUBBLE_API_URL,
  BUBBLE_API_KEY,
  SUPPLIER_REF,
  BRAND_NAME
} = process.env;

var records = [];
var monthEnd = "";
var today = "";

// Format utility
function pad(value, length, padChar = " ", align = "left") {
  const str = value?.toString() ?? "";
  if (align === "left") return str.padEnd(length, padChar).substring(0, length);
  return str.padStart(length, padChar).substring(0, length);
}

// Header line for Monthly file
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

function buildDataLine(r, recordType = "D") {
  return (
    pad(recordType, 1) +
    pad(r.sa_id_number, 13, "0", "right") +
    pad(r.non_sa_id_text || "", 16) +
    pad(r.gender_text || "", 1) +
    pad(r.dateofbirth_text || "", 8) +
    pad(r.branchcode_text || "", 8) +
    pad(r.accountnumber_number || "", 25) +
    pad(r.subaccountnumber_text || "", 4) +
    pad(r.surname_text || "", 25) +
    pad(r.title_text || "", 5) +
    pad(r.forename1_text || "", 14) +
    pad(r.forename2_text || "", 14) +
    pad(r.forename3_text || "", 14) +
    pad(r.addressline1_text || "", 25) +
    pad(r.addressline2_text || "", 25) +
    pad(r.addressline3_text || "", 25) +
    pad(r.addressline4_text || "", 25) +
    pad(r.addresspostalcode_number || "", 6) +
    pad(r.ownerortenant_text || "", 1) +
    pad(r.postaladdressline1_text || "", 25) +
    pad(r.postaladdressline2_text || "", 25) +
    pad(r.postaladdressline3_text || "", 25) +
    pad(r.postaladdressLine4_text || "", 25) +
    pad(r.postalcode_number || "", 6) +
    pad(r.ownershiptype_text || "", 2) +
    pad(r.loanreasoncode_text || "", 2) +
    pad(r.paymenttype_text || "", 2) +
    pad("M", 2) +
    pad(r.date_account_opened || "", 8) +
    pad(r.deferred_payment_date || "00000000", 8) +
    pad(r.last_payment_date || "00000000", 8) +
    pad(r.openingbalance_number || "0", 9, "0", "right") +
    pad(r.currentbalance_number || "0", 9, "0", "right") +
    pad(r.currentbalanceindicator_number || "", 1) +
    pad(r.arrearamount_number || "0", 9, "0", "right") +
    pad(r.instalmentamount_number || "0", 9, "0", "right") +
    pad(r.monthsinarrears_number || "00", 2, "0", "right") +
    pad(r.statuscode_text || "", 2) +
    pad(r.repaymentfrequency_text || "00", 2) +
    pad(r.terms_text || "0000", 4) +
    pad(r.statusdate_text || "00000000", 8) +
    pad(r.oldsupplierbranchcode_text || "", 8) +
    pad(r.oldaccountnumber_text || "", 25) +
    pad(r.oldsubaccountnumber_text || "", 4) +
    pad(r.oldsupplierreferencenumber_text || "", 10) +
    pad(r.hometelephone_number || "", 16) +
    pad(r.cellphonenumber_number || "", 16) +
    pad(r.employerphone_number || "", 16) +
    pad(r.employername_text || "", 60) +
    pad(r.income_number || "0", 9, "0", "right") +
    pad(r.incomefrequency_text || "", 1) +
    pad(r.occupation_text || "", 20) +
    pad(r.thirdpartyname_name || "", 60) +
    pad(r.accountsoldtothirdparty_text || "00", 2) +
    pad(r.numberofparticipantsinjointloan_number || "000", 3) +
    pad("", 2)
  );
}

// Trailer line for Monthly file
function buildTrailer(count) {
  return "T" + pad(count, 9, "0", "right") + pad("", 690);
}

function determineStatusCode(r) {
  const balance = parseInt(r.current_balance || "0", 10);
  const installment = parseInt(r.installment_amount || "0", 10);
  const opened = dayjs(r.date_account_opened, "YYYYMMDD");
  const paid = dayjs(r.last_payment_date || r.status_date, "YYYYMMDD");

  if (balance <= 0) return "C";
  if (balance <= installment && paid.diff(opened, "day") < 30) return "T";
  if (balance <= installment && paid.diff(opened, "day") <= 5) return "V";

  return "";
}

function enrichFields(r) {
  const code = r.status_code;

  // Status date required when status is C, T, V
  if (["C", "T", "V"].includes(code)) {
    r.status_date = r.last_payment_date || r.status_date || dayjs().format("YYYYMMDD");
  } else {
    r.status_date = "00000000";
  }

  // Amount overdue if months_in_arrears > 00
  const months = parseInt(r.months_in_arrears || "0", 10);
  r.amount_overdue = months > 0 ? (r.amount_overdue || "0") : "0";

  return r;
}

function buildDailyLine(r, transactionDate, seenAccounts) {
  const balance = parseInt(r.current_balance || "0", 10);
  const isClosed = balance <= 0;
  const isNew = !seenAccounts.has(r.account_number);
  let recordType = "D";

  if (isClosed) {
    // Closure: requires status_code + status_date
    r.status_code = determineStatusCode(r);
    enrichFields(r);
    recordType = "C";
  } else if (isNew) {
    // Registration: must NOT contain status_code or status_date
    r.status_code = "";
    r.status_date = "00000000";
    r.amount_overdue = "0";
    recordType = "R";
  } else {
    // Mid-month update: no status code
    r.status_code = "";
    r.status_date = "00000000";
    r.amount_overdue = "0";
    recordType = "D"; // Unlikely used for daily but added safely
  }

  seenAccounts.add(r.account_number);
  return buildDataLine(r, recordType) + pad(SUPPLIER_REF, 10, " ", "right") + pad(transactionDate, 8, "0", "right");
}

function groupByAccount(records) {
  const grouped = {};
  records.forEach((r) => {
    const acc = r.account_number;
    if (!grouped[acc] || r.status_date > grouped[acc].status_date) {
      grouped[acc] = r;
    }
  });
  return Object.values(grouped);
}

generateFiles("sacrra_account/");

async function generateFiles(tableName, type = "daily") {
  const today = dayjs().format("YYYYMMDD");
  const monthEnd = dayjs().endOf("month").format("YYYYMMDD");

  const response = await axios.get(`${BUBBLE_API_URL}${tableName}`, {
    headers: { Authorization: `Bearer ${BUBBLE_API_KEY}` }
  });

  const results = response.data.response.results;
  const seenAccounts = new Set();

  console.log("res ", results);

  // === DAILY FILE ===
  const dailyRecords = results.map((r) => buildDailyLine(r, today, seenAccounts));
  const dailyFile = `${SUPPLIER_REF}_ALL_L702_D_${today}_1_1.txt`;
  fs.writeFileSync(dailyFile, dailyRecords.join("\r\n"), "ascii");
  //execSync(`./encrypt.sh ${today} D`);

  // === MONTHLY FILE ===
  const grouped = groupByAccount(results);
  const monthly = [
  buildHeader(monthEnd, today),
    ...grouped.map((r) => {
      r.status_code = determineStatusCode(r);
      enrichFields(r);
      return buildDataLine(r, "D"); // Monthly file always D
    }),
    buildTrailer(grouped.length + 2)
  ];
  const monthlyFile = `${SUPPLIER_REF}_ALL_L702_M_${monthEnd}_1_1.txt`;
  fs.writeFileSync(monthlyFile, monthly.join("\r\n"), "ascii");
  //execSync(`./encrypt.sh ${monthEnd} M`);

  return [dailyFile + ".pgp", monthlyFile + ".pgp"];
}