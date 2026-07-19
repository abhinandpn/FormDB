/**
 * Talrop Employee Details Verification System
 * Main Controller File (Code.gs)
 *
 * Senior Full Stack Engineer: Antigravity AI
 * Date: 2026-07-19
 */

// Non-secret service configuration. Store ADMIN_PIN and, for standalone scripts,
// SPREADSHEET_ID under Project Settings > Script Properties.
var GOOGLE_FORM_URL = "https://docs.google.com/forms/d/1OI3ZY51dfsIVLPXkLtrshGBLF21ehrvOkzyfdi1Q5QY/edit";

/**
 * Run once from the Apps Script editor after changing required permissions.
 * Authorizes access to the configured database Sheet and Google Form without
 * creating or modifying a submission.
 */
function authorizeServices() {
  var spreadsheet = getSpreadsheet();
  var form = FormApp.openByUrl(GOOGLE_FORM_URL);

  Logger.log("Spreadsheet connected: " + spreadsheet.getName());
  Logger.log("Form connected: " + form.getTitle());
}

/**
 * Handles HTTP GET requests to serve the web application.
 * @param {Object} e HTTP event parameters
 * @return {HtmlOutput} The rendered HTML interface
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile("index");
  return template.evaluate()
    .setTitle("Talrop Employee Details Verification System")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Includes the contents of external HTML/CSS/JS files inside the main template.
 * Used for modularizing project structure.
 * @param {string} filename The name of the file to include (without .html)
 * @return {string} The text content of the file
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Handles secure server-side form submission.
 * Trims inputs, escapes HTML, validates fields, checks duplicates, and saves.
 * @param {Object} formData Client-side form data payload
 * @return {Object} JSON response indicating success or failure status
 */
function submitForm(formData) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    // 1. Sanitize input data (Trim spaces & Escape HTML to prevent XSS)
    var sanitizedData = sanitizeInputData(formData);
    
    // 2. Validate input fields server-side
    var validationResult = validateInput(sanitizedData);
    if (!validationResult.isValid) {
      return createJsonResponse(false, validationResult.message);
    }
    
    // Serialize duplicate checks, ID generation, and database writes so that
    // concurrent submissions cannot create duplicate IDs or phone entries.
    lockAcquired = lock.tryLock(30000);
    if (!lockAcquired) {
      return createJsonResponse(false, "The system is busy processing another submission. Please try again.");
    }

    // 3. Check duplicate phone number
    var phone = sanitizedData.phoneNumber;
    var isDuplicate = checkDuplicatePhone(phone);
    if (isDuplicate) {
      return createJsonResponse(
        false, 
        "This mobile number has already been submitted. If you need to update your information, please contact the coordinator."
      );
    }

    // 4. Generate unique Submission ID
    var submissionId = generateSubmissionID();
    
    // 5. Save locally before contacting the remote Form. If the Form rejects
    // the response, the local insert is rolled back below.
    var savedRow = saveEmployee(sanitizedData, submissionId);
    if (!savedRow) {
      return createJsonResponse(false, "Failed to save details to the database. Please try again.");
    }

    // 6. Create an actual response in the connected Google Form.
    var googleFormResult = submitToGoogleForm(sanitizedData);
    if (!googleFormResult.success) {
      var rollbackSuccess = rollbackEmployeeSave(submissionId, savedRow);
      var rollbackMessage = rollbackSuccess
        ? ""
        : " The local record could not be rolled back; please contact the coordinator before retrying.";

      return createJsonResponse(
        false,
        "Google Form submission failed: " + googleFormResult.message + rollbackMessage
      );
    }
    
    // 7. Return successful response
    return createJsonResponse(true, "Details submitted successfully.", submissionId);
    
  } catch (error) {
    Logger.log("Error inside submitForm: " + error.toString());
    return createJsonResponse(false, "An unexpected server error occurred: " + error.toString());
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Creates a response directly in the connected Google Form. Keeping this
 * operation in the main backend avoids exposing a separate public proxy.
 * @param {Object} data Sanitized and validated employee details
 * @return {{success: boolean, message: string}}
 */
function submitToGoogleForm(data) {
  try {
    var answersByTitle = {
      "employee name": data.employeeName,
      "phone number": data.phoneNumber,
      "email address": data.email,
      "employee id": data.employeeId || "",
      "employee id (optional)": data.employeeId || "",
      "designation": data.designation,
      "last drawn monthly salary": data.salary,
      "date of joining": data.dateOfJoining,
      "employment status": data.employmentStatus,
      "date of resignation / termination": data.dateOfLeaving || "",
      "date of resignation": data.dateOfLeaving || "",
      "date of termination": data.dateOfLeaving || "",
      "reason for resignation / termination": data.reason || "",
      "reason for resignation": data.reason || "",
      "reason for termination": data.reason || "",
      "benefits / amount already received": data.benefitsReceived,
      "benefits / amount already received from the company": data.benefitsReceived,
      "pending salary": data.pendingSalary,
      "retrenchment compensation amount": data.retrenchmentCompensation,
      "other pending compensation benefits": data.otherCompensation,
      "have you already filled out the google form given by the employment commission?": data.commissionFormFilled,
      "declaration": data.declaration,
      "i hereby declare that the information provided above is true and accurate to the best of my knowledge.": data.declaration
    };

    var form = FormApp.openByUrl(GOOGLE_FORM_URL);
    var formResponse = form.createResponse();

    form.getItems().forEach(function(item) {
      var normalizedTitle = item.getTitle().toLowerCase().trim().replace(/\s+/g, " ");
      var answer = answersByTitle[normalizedTitle];

      if (answer === undefined || answer === null || answer === "") {
        return;
      }

      switch (item.getType()) {
        case FormApp.ItemType.TEXT:
          formResponse.withItemResponse(item.asTextItem().createResponse(String(answer)));
          break;
        case FormApp.ItemType.PARAGRAPH_TEXT:
          formResponse.withItemResponse(item.asParagraphTextItem().createResponse(String(answer)));
          break;
        case FormApp.ItemType.MULTIPLE_CHOICE:
          formResponse.withItemResponse(item.asMultipleChoiceItem().createResponse(String(answer)));
          break;
        case FormApp.ItemType.LIST:
          formResponse.withItemResponse(item.asListItem().createResponse(String(answer)));
          break;
        case FormApp.ItemType.CHECKBOX:
          var checkboxItem = item.asCheckboxItem();
          var checkboxAnswers = answer === true
            ? [checkboxItem.getChoices()[0].getValue()]
            : String(answer).split(",").map(function(value) { return value.trim(); });
          formResponse.withItemResponse(checkboxItem.createResponse(checkboxAnswers));
          break;
        case FormApp.ItemType.DATE:
          var dateParts = String(answer).split("-");
          var dateAnswer = new Date(
            Number(dateParts[0]),
            Number(dateParts[1]) - 1,
            Number(dateParts[2])
          );
          formResponse.withItemResponse(item.asDateItem().createResponse(dateAnswer));
          break;
      }
    });

    formResponse.submit();

    return {
      success: true,
      message: "Google Form response recorded."
    };
  } catch (error) {
    Logger.log("Error inside submitToGoogleForm: " + error.toString());
    return {
      success: false,
      message: error.message || error.toString()
    };
  }
}

/**
 * Verifies admin credentials and retrieves submission details and statistics.
 * @param {string} pin Admin access PIN
 * @return {Object} JSON response with authorization status and data payload
 */
function getAdminData(pin) {
  try {
    var adminPin = PropertiesService.getScriptProperties().getProperty("ADMIN_PIN");
    if (!adminPin) {
      return {
        success: false,
        message: "Admin access is not configured. Add ADMIN_PIN in Project Settings > Script Properties."
      };
    }

    var userKey = Session.getTemporaryActiveUserKey() || "anonymous";
    var cache = CacheService.getScriptCache();
    var attemptKey = "admin_attempts_" + userKey;
    var failedAttempts = Number(cache.get(attemptKey) || 0);

    if (failedAttempts >= 5) {
      return {
        success: false,
        message: "Too many incorrect attempts. Please wait 10 minutes before trying again."
      };
    }

    // Trim and compare PIN
    var cleanPin = (pin || "").toString().trim();
    if (cleanPin !== adminPin) {
      cache.put(attemptKey, String(failedAttempts + 1), 600);
      return {
        success: false,
        message: "Unauthorized access. Invalid PIN."
      };
    }

    cache.remove(attemptKey);
    
    // Fetch all submissions from Google Sheets database
    var submissions = fetchSubmissions();
    
    // Compute dashboard statistics
    var totalEmployees = submissions.length;
    var totalPendingSalary = 0;
    
    submissions.forEach(function(row) {
      // Parse pending salary and accumulate
      var pending = parseFloat(row.pendingSalary);
      if (!isNaN(pending)) {
        totalPendingSalary += pending;
      }
    });
    
    return {
      success: true,
      message: "Data retrieved successfully.",
      data: {
        submissions: submissions,
        stats: {
          totalEmployees: totalEmployees,
          totalPendingSalary: totalPendingSalary
        }
      }
    };
    
  } catch (error) {
    Logger.log("Error inside getAdminData: " + error.toString());
    return {
      success: false,
      message: "Server error fetching admin data: " + error.toString()
    };
  }
}
