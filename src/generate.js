require('dotenv').config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dayjs = require("dayjs");

//const { determineStatusCode } = require("./helper/determineStatusCode");
const { enrichFields } = require("./helper/enrichFields");
const { normalizeDate } = require("./helper/normalizeDate");
const { shouldIncludeRecord } = require("./helper/recordsToInclude");

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

function buildHeader(monthEnd, creationDate) {
  const headerLine = "H" +
    pad(SUPPLIER_REF, 10, " ", "right") + // positions 2–11
    pad(monthEnd, 8, "0") +               // positions 12–19
    "06" +                                // positions 20–21
    pad(creationDate, 8, "0") +           // positions 22–29
    pad(BRAND_NAME, 60) +                 // positions 30–89
    pad("", 611);                         // remaining positions to reach 700

  if (headerLine.length !== 700) {
    throw new Error(`Header length is ${headerLine.length}, expected 700`);
  }  
  return headerLine;
}

function buildTrailer(count) {
  const line =
    "T" +
    pad(count, 9, "0", "right") + // positions 2–10
    pad("", 690);                 // remaining positions to reach 700

  if (line.length !== 700) {
    throw new Error(`Trailer length is ${line.length}, expected 700`);
  }
  return line;
}

/**
 * buildDataLine: Accepts a dataIndicator (1 char)
 * - For monthly rows pass 'D'
 * - For daily rows pass 'R' (registration) or 'C' (closure)
 */
function buildDataLine(r, dataIndicator = "D") {
  r.Date_Account_Opened = normalizeDate(r["Created Date"])

  if (typeof(r.SA_ID) !== "undefined" && r.SA_ID !== "0000000000000") {
    return (
      pad(dataIndicator, 1) +                                   // 1
      pad(r.SA_ID, 13, "0", "right") +                          // 2
      pad(r.Non_SA_ID, 16) +                                    // 3
      pad(r.Gender, 1) +                                        // 4
      pad(r.Date_Of_Birth, 8) +                                 // 5
      pad(r.Branch_Code, 8) +                                   // 6
      pad(r.Account_Number, 25) +                               // 7
      pad(r.Sub_Account_Number, 4) +                            // 8
      pad(r.Surname, 25) +                                      // 9
      pad(r.Title, 5) +                                         // 10
      pad(r.Forename1, 14) +                                    // 11
      pad(r.Forename2, 14) +                                    // 12
      pad(r.Forename3, 14) +                                    // 13
      pad(r.Address_Line1, 25) +                                // 14
      pad(r.Address_Line2, 25) +                                // 15
      pad(r.Address_Line3, 25) +                                // 16
      pad(r.Address_Line4, 25) +                                // 17
      pad(r.Address_Postal_Code, 6) +                           // 18
      pad(r.Owner_Or_Tenant, 1) +                               // 19
      pad(r.Postal_Address_Line1, 25) +                         // 20
      pad(r.Postal_Address_Line2, 25) +                         // 21
      pad(r.Postal_Address_Line3, 25) +                         // 22
      pad(r.Postal_Address_Line4, 25) +                         // 23
      pad(r.Postal_Code, 6) +                                   // 24
      pad(r.Ownership_Type, 2) +                                // 25
      pad(r.Loan_Reason_Code, 2) +                              // 26
      pad(r.Payment_Type, 2) +                                  // 27
      pad("M", 2) +                                             // 28
      pad(r.Date_Account_Opened, 8) +                           // 29
      pad(r.Deferred_Payment || "00000000", 8) +                // 30
      pad(r.Last_Payment_Date || "00000000", 8) +               // 31
      pad(r.Opening_Balance, 9, " ", "right") +                 // 32
      pad(r.Current_Balance || "0", 9, "0", "right") +          // 33
      pad(r.Current_Balance_Indicator, 1) +                     // 34
      pad(r.Amount_Overdue || "0", 9, "0", "right") +           // 35
      pad(r.Installment_Amount || "0", 9, "0", "right") +       // 36
      pad(r.Months_In_Arrears || "00", 2, "0", "right") +       // 37
      pad(r.Status_Code, 2) +                                   // 38
      pad(r.Repayment_Frequency || "00", 2) +                   // 39
      pad(r.Terms || "0001", 4) +                               // 40
      pad(r.Status_Date || "00000000", 8) +                     // 41
      pad(r.Old_Supplier_Branch_Code, 8) +                      // 42
      pad(r.Account_Number, 25) +                               // 43
      pad(r.Account_Number, 4) +                                // 44
      pad(r.Old_Supplier_Reference_Number, 10) +                // 45
      pad(r.Home_Telephone ? "0" + r.Home_Telephone : "", 16) + // 46
      pad(r.Cellphone ? "0" + r.Cellphone : "", 16) +           // 47
      pad(r.Employer_Phone ? "0" + r.Employer_Phone : "", 16) + // 48
      pad(r.Employer_Name, 60) +                                // 49
      pad(r.Income, 9, " ", "right") +                          // 50
      pad(r.Income_Frequency, 1) +                              // 51
      pad(r.Occupation, 20) +                                   // 52
      pad(r.Third_Party_Name, 60) +                             // 53
      pad(r.Account_Sold_To_Third_Party || "00", 2) +           // 54
      pad(r.Number_Of_Participants_In_Joint_Loan, 3) +          // 56
      pad("", 2)                                                // filler
    );
  }
  else {
    return null;
  }
}

// validator: ensures ASCII & consistent line lengths
function validateFileLines(lines, type) {
  const monthlyExpectedLength = 700;
  const dailyExpectedLength = 718;

  if (!lines || lines.length === 0) throw new Error("Empty file");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln === "") continue;
    if (!/^[\x00-\x7F]*$/.test(ln)) throw new Error(`Non-ASCII characters found at line ${i + 1}`);
    if (type == "monthly") {
      if (ln.length !== monthlyExpectedLength) {
        throw new Error(`Line ${i + 1} length (${ln.length}) != expected ${monthlyExpectedLength}`);
      }
    }
    else {
      if (ln.length !== dailyExpectedLength) {
        throw new Error(`Line ${i + 1} length (${ln.length}) != expected ${dailyExpectedLength}`);
      }
    }
  }
}

/**
 * buildDailyLine:
 * - determines if record is a registration (R) or closure (C) per Layout 700v2:
 *   * Registration (R): dateaccountopened_text within last 48 hours (transaction date window)
 *   * Closure (C): Current_Balance_number <= 0
 * - Only includes records that qualify as R or C in the daily output (the spec expects daily files to contain registrations & closures).
 * - Appends supplier ref and transaction date (positions 701-718) as required for daily layout.
 */
function buildDailyLine(r, transactionDate, monthEnd) {
  r.Months_In_Arrears = "  "; // No months in arrears for daily files
  enrichFields(r);

  const { include, type } = shouldIncludeRecord(r, transactionDate, monthEnd, true);
  if (!include) return null; // skip records that don't qualify

  if (type === "C" && !r.Status_Code) r.Status_Code = "C";
  if (type === "C" && (!r.Status_Date || r.Status_Date === "00000000")) {
    r.Status_Date = r.Last_Payment_Date || transactionDate;
  }
  
  const dataLine = buildDataLine(r, type);
  if (dataLine) {
    // Append supplier ref (pos 701-710) and transaction date (pos 711-718)
    return dataLine + pad(SUPPLIER_REF, 10, " ", "right") + pad(transactionDate, 8, "0", "right");
  }
  else {
    return null; // skip if no data line was built
  }
}

function groupByAccountMonthly(records, monthEnd, today) {
  const grouped = {};
  records.forEach((r) => {
    const { include } = shouldIncludeRecord(r, today, monthEnd, false);
    if (!include) return;

    const acc = r.Account_Number;
    const statusDate = r.Status_Date ? dayjs(r.Status_Date, "YYYYMMDD") : null;

    if (!grouped[acc] || (statusDate && statusDate.isAfter(dayjs(grouped[acc].Status_Date, "YYYYMMDD")))) {
      grouped[acc] = r;
    }
  });
  return Object.values(grouped);
}

async function generate(tableName, monthEndDate, transactionDate, type = "daily", outputDir = "/tmp") {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const today = dayjs().format("YYYYMMDD");
  const transactDate = transactionDate ? transactionDate : today;
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
      const dailyLine = buildDailyLine(r, transactDate);
      if (dailyLine !== null) dailyLines.push(dailyLine);
    }

    if (dailyLines.length > 0) {
      const dailyFile = `${SUPPLIER_REF}_ALL_L702_D_${transactDate}_1_1.txt`;
      const dailyFilePath = path.join(outputDir, dailyFile);

      // validation: each line must be same length and ASCII
      validateFileLines(dailyLines, "daily");

      fs.writeFileSync(dailyFilePath, dailyLines.join("\r\n"), "ascii");

      outputFiles.push(dailyFilePath);
    } else {
      // no daily rows to write - this is ok, return empty list (caller decides)
      console.warn("No daily registrations/closures found for date", transactDate);
    }
  }

  // MONTHLY
  if (type === "monthly" || type === "both") {
    const grouped = groupByAccountMonthly(results, monthEnd, today);
    const headerLine = buildHeader(monthEnd, today);

    const monthlyLines = [
      headerLine,
      ...grouped.map((r) => {
        enrichFields(r);
        return buildDataLine(r, "D"); // always "D" for monthly
      }),
      buildTrailer(grouped.length + 2)
    ];

    const monthlyFile = `${SUPPLIER_REF}_ALL_L702_M_${monthEnd}_1_1.txt`;
    const monthlyFilePath = path.join(outputDir, monthlyFile);

    validateFileLines(monthlyLines, "monthly");

    fs.writeFileSync(monthlyFilePath, monthlyLines.join("\r\n"), "ascii");
    outputFiles.push(monthlyFilePath);
  }

  return outputFiles;
}

module.exports = { generate };
