/**
 * Talrop Employee Details Verification System
 * Main Controller File (Code.gs)
 *
 * Senior Full Stack Engineer: Antigravity AI
 * Date: 2026-07-19
 */

// Non-secret service configuration. Store ADMIN_PIN and, for standalone scripts,
// SPREADSHEET_ID under Project Settings > Script Properties.
var GOOGLE_FORM_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxBvGh_Kb--9umURYLCUrBXVlm4WZhsuBTKD39nBm9Lgm6K1h4vDuyTfKTEmzIBgVdw/exec";

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
 * Forwards a validated employee submission to the separately deployed
 * Google Forms web app and verifies its JSON response.
 * @param {Object} data Sanitized and validated employee details
 * @return {{success: boolean, message: string}}
 */
function submitToGoogleForm(data) {
  try {
    var payload = {
      employeeName: data.employeeName,
      phoneNumber: data.phoneNumber,
      emailAddress: data.email,
      employeeId: data.employeeId || "",
      designation: data.designation,
      lastDrawnSalary: data.salary,
      dateOfJoining: data.dateOfJoining,
      employmentStatus: data.employmentStatus,
      dateOfLeaving: data.dateOfLeaving || "",
      reason: data.reason || "",
      benefitsReceived: data.benefitsReceived,
      pendingSalary: data.pendingSalary,
      retrenchmentCompensation: data.retrenchmentCompensation,
      otherPendingBenefits: data.otherCompensation,
      commissionFormFilled: data.commissionFormFilled,
      declaration: "I hereby declare that the information provided above is true and accurate to the best of my knowledge."
    };

    var response = UrlFetchApp.fetch(GOOGLE_FORM_WEB_APP_URL, {
      method: "post",
      payload: payload,
      followRedirects: true,
      muteHttpExceptions: true
    });

    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    var result;

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      return {
        success: false,
        message: "The Google Form service returned an invalid response (HTTP " + statusCode + ")."
      };
    }

    if (statusCode < 200 || statusCode >= 300 || !result.success) {
      return {
        success: false,
        message: result.message || ("Google Form service returned HTTP " + statusCode + ".")
      };
    }

    return {
      success: true,
      message: result.message || "Google Form response recorded."
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

    // Trim and compare PIN
    var cleanPin = (pin || "").toString().trim();
    if (cleanPin !== adminPin) {
      return {
        success: false,
        message: "Unauthorized access. Invalid PIN."
      };
    }
    
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
