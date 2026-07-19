/**
 * Talrop Employee Details Verification System
 * Database Module (Database.gs)
 *
 * Senior Full Stack Engineer: Antigravity AI
 * Date: 2026-07-19
 */

var SHEET_NAME = "Submissions";

/**
 * Retrieves the Google Sheets database tab. Creates it with headers if it doesn't exist.
 * @return {Sheet} The spreadsheet active sheet
 */
function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Standalone Apps Script web apps do not have an active spreadsheet.
  // In that case, configure SPREADSHEET_ID under Project Settings > Script Properties.
  if (!ss) {
    var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) {
      throw new Error(
        "Database is not configured. Add SPREADSHEET_ID in Project Settings > Script Properties."
      );
    }
    ss = SpreadsheetApp.openById(spreadsheetId);
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  
  // Set headers if the sheet is brand new/empty
  if (sheet.getLastRow() === 0) {
    var headers = [
      "Submission ID",
      "Timestamp",
      "Employee Name",
      "Phone Number",
      "Email",
      "Employee ID",
      "Designation",
      "Salary",
      "Date of Joining",
      "Date of Leaving",
      "Employment Status",
      "Reason",
      "Benefits Received",
      "Pending Salary",
      "Retrenchment Compensation",
      "Other Compensation",
      "Commission Form Filled"
    ];
    
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#E0F2F1"); // Light teal background
    headerRange.setFontColor("#004D40"); // Dark teal text
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

/**
 * Checks whether a phone number already exists in the Google Sheet.
 * @param {string} phone Trimmed phone number to check
 * @return {boolean} True if duplicate found, false otherwise
 */
function checkDuplicatePhone(phone) {
  var sheet = getSpreadsheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false; // Only headers exist
  
  var cleanPhone = (phone || "").toString().trim();
  if (cleanPhone === "") return false;
  
  // Phone Number is in Column 4
  var phoneValues = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  
  for (var i = 0; i < phoneValues.length; i++) {
    var existingPhone = (phoneValues[i][0] || "").toString().trim();
    if (existingPhone === cleanPhone) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generates a unique sequential Submission ID formatted as: TLR-YYYY-XXXX.
 * E.g., TLR-2026-0001, TLR-2026-0002.
 * @return {string} Generated Submission ID
 */
function generateSubmissionID() {
  var sheet = getSpreadsheet();
  var lastRow = sheet.getLastRow();
  var currentYear = new Date().getFullYear();
  var nextIndex = 1;
  
  if (lastRow > 1) {
    // Read all Submission IDs from Column 1
    var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var prefix = "TLR-" + currentYear + "-";
    var maxIndex = 0;
    
    for (var i = 0; i < idValues.length; i++) {
      var currentId = (idValues[i][0] || "").toString().trim();
      if (currentId.indexOf(prefix) === 0) {
        var indexStr = currentId.substring(prefix.length);
        var indexVal = parseInt(indexStr, 10);
        if (!isNaN(indexVal) && indexVal > maxIndex) {
          maxIndex = indexVal;
        }
      }
    }
    nextIndex = maxIndex + 1;
  }
  
  // Format with leading zeros, e.g., 0001
  var paddedIndex = ("0000" + nextIndex).slice(-4);
  return "TLR-" + currentYear + "-" + paddedIndex;
}

/**
 * Saves employee data row into the spreadsheet.
 * @param {Object} data Sanitized employee data object
 * @param {string} submissionId Generated Submission ID
 * @return {number|boolean} Inserted row number, or false when saving fails
 */
function saveEmployee(data, submissionId) {
  try {
    var sheet = getSpreadsheet();
    
    // Format dates to strings for database storage
    var formattedDateOfJoining = data.dateOfJoining; // already YYYY-MM-DD
    var formattedDateOfLeaving = data.dateOfLeaving || ""; // YYYY-MM-DD or empty
    
    var row = [
      submissionId,
      new Date(), // Submission Timestamp
      data.employeeName,
      data.phoneNumber,
      data.email || "",
      data.employeeId || "",
      data.designation,
      parseFloat(data.salary),
      formattedDateOfJoining,
      formattedDateOfLeaving,
      data.employmentStatus,
      data.reason || "",
      parseFloat(data.benefitsReceived),
      parseFloat(data.pendingSalary),
      parseFloat(data.retrenchmentCompensation),
      parseFloat(data.otherCompensation),
      data.commissionFormFilled || "No"
    ];
    
    sheet.appendRow(row);
    return sheet.getLastRow();
  } catch (error) {
    Logger.log("Error inside saveEmployee: " + error.toString());
    return false;
  }
}

/**
 * Removes a locally saved submission when the connected Google Form rejects it.
 * The submission ID check prevents deleting an unrelated row.
 * @param {string} submissionId Submission identifier to remove
 * @param {number} expectedRow Row returned by saveEmployee
 * @return {boolean} True when the row was removed
 */
function rollbackEmployeeSave(submissionId, expectedRow) {
  try {
    var sheet = getSpreadsheet();
    var row = Number(expectedRow);

    if (row < 2 || row > sheet.getLastRow()) {
      return false;
    }

    var storedId = (sheet.getRange(row, 1).getValue() || "").toString();
    if (storedId !== submissionId) {
      return false;
    }

    sheet.deleteRow(row);
    return true;
  } catch (error) {
    Logger.log("Error inside rollbackEmployeeSave: " + error.toString());
    return false;
  }
}

/**
 * Fetches all submissions from Google Sheets, mapping them to structured JSON objects.
 * Formats dates and timestamps to safe strings for web transmission.
 * @return {Array<Object>} List of employee submissions
 */
function fetchSubmissions() {
  var sheet = getSpreadsheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return []; // Only headers exist
  
  var lastColumn = sheet.getLastColumn();
  var dataValues = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var results = [];
  var timezone = Session.getScriptTimeZone();
  
  for (var i = 0; i < dataValues.length; i++) {
    var row = dataValues[i];
    
    // Format timestamp securely
    var timestampStr = "";
    if (row[1] instanceof Date) {
      timestampStr = Utilities.formatDate(row[1], timezone, "yyyy-MM-dd HH:mm:ss");
    } else if (row[1]) {
      timestampStr = row[1].toString();
    }
    
    // Format joining date
    var joiningStr = "";
    if (row[8] instanceof Date) {
      joiningStr = Utilities.formatDate(row[8], timezone, "yyyy-MM-dd");
    } else if (row[8]) {
      joiningStr = row[8].toString();
    }
    
    // Format leaving date
    var leavingStr = "";
    if (row[9] instanceof Date) {
      leavingStr = Utilities.formatDate(row[9], timezone, "yyyy-MM-dd");
    } else if (row[9]) {
      leavingStr = row[9].toString();
    }
    
    results.push({
      submissionId: (row[0] || "").toString(),
      timestamp: timestampStr,
      employeeName: (row[2] || "").toString(),
      phoneNumber: (row[3] || "").toString(),
      email: (row[4] || "").toString(),
      employeeId: (row[5] || "").toString(),
      designation: (row[6] || "").toString(),
      salary: parseFloat(row[7]) || 0,
      dateOfJoining: joiningStr,
      dateOfLeaving: leavingStr,
      employmentStatus: (row[10] || "").toString(),
      reason: (row[11] || "").toString(),
      benefitsReceived: parseFloat(row[12]) || 0,
      pendingSalary: parseFloat(row[13]) || 0,
      retrenchmentCompensation: parseFloat(row[14]) || 0,
      otherCompensation: parseFloat(row[15]) || 0,
      commissionFormFilled: (row[16] || "No").toString()
    });
  }
  
  return results;
}
