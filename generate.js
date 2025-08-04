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

function pad(value, length, padChar = " ", align = "left") {
  const str = value?.toString() ?? "";
  if (align === "left") return str.padEnd(length, padChar).substring(0, length);
  return str.padStart(length, padChar).substring(0, length);
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

function buildDataLine(r) {
  return (
    pad("D", 1) +
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
    pad("M", 2) +
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

function buildDailyLine(r, transactionDate, seenAccounts) {
  const balance = parseInt(r.current_balance || "0", 10);
  const installment = parseInt(r.installment_amount || "0", 10);
  const isClosed = balance <= 0;
  const isNew = !seenAccounts.has(r.account_number);

  if (isClosed) {
    r.status_code = "C";
  } else if (isNew) {
    r.status_code = "R";
  } else {
    r.status_code = "";
  }

  seenAccounts.add(r.account_number);

  enrichFields(r);

  return buildDataLine(r) + pad(SUPPLIER_REF, 10, " ", "right") + pad(transactionDate, 8, "0", "right");
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

async function generate(tableName, type = "daily") {
  const today = dayjs().format("YYYYMMDD");
  const monthEnd = dayjs().endOf("month").format("YYYYMMDD");

  const response = await axios.get(`${BUBBLE_API_URL}${tableName}`, {
    headers: { Authorization: `Bearer ${BUBBLE_API_KEY}` }
  });

  const results = response.data.response.results;
  const seenAccounts = new Set();

  const outputFiles = [];

  // === DAILY FILE ===
  if (type === "daily" || type === "both") {
    const dailyRecords = results.map((r) => buildDailyLine(r, today, seenAccounts));
    const dailyFile = `${SUPPLIER_REF}_ALL_L702_D_${today}_1_1.txt`;
    fs.writeFileSync(dailyFile, dailyRecords.join("\r\n"), "ascii");

    // GPG encryption
    //execSync(`./encrypt.sh ${today} D`);
    outputFiles.push(dailyFile) //+ ".pgp");
  }

  // === MONTHLY FILE ===
  if (type === "monthly" || type === "both") {
    const grouped = groupByAccount(results);
    const monthly = [
      buildHeader(monthEnd, today),
      ...grouped.map((r) => {
        r.status_code = determineStatusCode(r);
        enrichFields(r);
        return buildDataLine(r);
      }),
      buildTrailer(grouped.length + 2)
    ];
    const monthlyFile = `${SUPPLIER_REF}_ALL_L702_M_${monthEnd}_1_1.txt`;
    fs.writeFileSync(monthlyFile, monthly.join("\r\n"), "ascii");

    // GPG encryption
    //execSync(`./encrypt.sh ${monthEnd} M`);
    outputFiles.push(monthlyFile) //+ ".pgp");
  }

  return outputFiles;
}


module.exports = { generate };