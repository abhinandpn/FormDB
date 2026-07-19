/**
 * Talrop Employee Details Verification System
 * Validation Module (Validation.gs)
 *
 * Senior Full Stack Engineer: Antigravity AI
 * Date: 2026-07-19
 */

/**
 * Validates the entire employee details form data payload.
 * Runs complete server-side verification. Never trust client-side validation.
 * @param {Object} data The sanitized input object
 * @return {Object} Validation status and error message if invalid
 */
function validateInput(data) {
  // 1. Employee Name: Required, minimum 3 characters
  if (!data.employeeName || data.employeeName.length < 3) {
    return { isValid: false, message: "Employee Name is required and must be at least 3 characters." };
  }

  // 2. Phone Number: Required, Indian mobile number pattern
  if (!data.phoneNumber) {
    return { isValid: false, message: "Phone Number is required." };
  }
  if (!isValidPhone(data.phoneNumber)) {
    return { isValid: false, message: "Invalid Phone Number. Must be a 10-digit Indian mobile number starting with 6-9." };
  }

  // 3. Email: Required, format validation
  if (!data.email) {
    return { isValid: false, message: "Email Address is required." };
  }
  if (!isValidEmail(data.email)) {
    return { isValid: false, message: "Invalid Email Address format." };
  }

  // 4. Designation: Required
  if (!data.designation || data.designation.length < 2) {
    return { isValid: false, message: "Designation is required." };
  }

  // 5. Last Drawn Monthly Salary: Required, numeric
  if (!data.salary) {
    return { isValid: false, message: "Last Drawn Monthly Salary is required." };
  }
  if (!isNumeric(data.salary) || parseFloat(data.salary) < 0) {
    return { isValid: false, message: "Last Drawn Monthly Salary must be a non-negative number." };
  }

  // 6. Date of Joining: Required, date format, cannot be future date
  if (!data.dateOfJoining) {
    return { isValid: false, message: "Date of Joining is required." };
  }
  if (!isValidDateFormat(data.dateOfJoining)) {
    return { isValid: false, message: "Invalid Date of Joining format. Use YYYY-MM-DD." };
  }
  if (isFutureDate(data.dateOfJoining)) {
    return { isValid: false, message: "Date of Joining cannot be in the future." };
  }

  // 7. Employment Status: Required
  var allowedStatus = ["Resigned", "Terminated", "Still Working"];
  if (!data.employmentStatus || allowedStatus.indexOf(data.employmentStatus) === -1) {
    return { isValid: false, message: "Invalid Employment Status selected." };
  }

  // Conditional Fields based on status
  var isLeavingStatus = data.employmentStatus === "Resigned" || data.employmentStatus === "Terminated";
  
  if (isLeavingStatus) {
    // 8. Date of Termination/Resignation (Date of Leaving): Required if Resigned/Terminated
    if (!data.dateOfLeaving) {
      return { isValid: false, message: "Date of Termination/Resignation is required for the selected status." };
    }
    if (!isValidDateFormat(data.dateOfLeaving)) {
      return { isValid: false, message: "Invalid Date of Leaving format. Use YYYY-MM-DD." };
    }
    if (isFutureDate(data.dateOfLeaving)) {
      return { isValid: false, message: "Date of Leaving cannot be in the future." };
    }
    
    // Chronology check: Joining date must be before or equal to leaving date
    if (compareDates(data.dateOfJoining, data.dateOfLeaving) > 0) {
      return { isValid: false, message: "Date of Joining must be before or equal to the Date of Leaving." };
    }

    // 9. Reason for Termination/Resignation: Required
    if (!data.reason || data.reason.trim().length < 5) {
      return { isValid: false, message: "Reason for Resignation/Termination is required and must be at least 5 characters." };
    }
  }

  // 10. Compensation Details: Required, numeric
  var compensationFields = [
    { key: "benefitsReceived", label: "Benefits/Amount Already Received" },
    { key: "pendingSalary", label: "Pending Salary" },
    { key: "retrenchmentCompensation", label: "Retrenchment Compensation Amount" },
    { key: "otherCompensation", label: "Other Pending Compensation Benefits" }
  ];

  for (var i = 0; i < compensationFields.length; i++) {
    var field = compensationFields[i];
    var val = data[field.key];
    if (val === undefined || val === null || val === "") {
      return { isValid: false, message: field.label + " is required. Input 0 if none." };
    }
    if (!isNumeric(val) || parseFloat(val) < 0) {
      return { isValid: false, message: field.label + " must be a non-negative number." };
    }
  }

  // 10.5. Commission Form Filled: Required, must be Yes or No
  if (data.commissionFormFilled !== "Yes" && data.commissionFormFilled !== "No") {
    return { isValid: false, message: "Please select whether you filled out the Commission Google Form." };
  }

  // 11. Declaration: Must be agreed (true)
  if (data.declaration !== true && data.declaration !== "true") {
    return { isValid: false, message: "You must accept the declaration to proceed." };
  }

  return { isValid: true, message: "Validation successful." };
}

/**
 * Validates Indian Phone Number (10 digits starting with 6-9).
 * @param {string} phone Input phone number
 * @return {boolean} True if phone is valid, false otherwise
 */
function isValidPhone(phone) {
  var phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * Validates Email Address format.
 * @param {string} email Input email address
 * @return {boolean} True if email format is correct, false otherwise
 */
function isValidEmail(email) {
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Checks if a string represents a valid number.
 * @param {string|number} val Input value
 * @return {boolean} True if numeric, false otherwise
 */
function isNumeric(val) {
  if (typeof val === 'number') return true;
  if (typeof val !== 'string') return false;
  return !isNaN(val) && !isNaN(parseFloat(val));
}

/**
 * Checks if format is YYYY-MM-DD.
 * @param {string} dateStr Date string
 * @return {boolean} True if valid format, false otherwise
 */
function isValidDateFormat(dateStr) {
  var dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  
  var parts = dateStr.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var day = parseInt(parts[2], 10);
  
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  // Extra day checks for month lengths
  var dateObj = new Date(year, month - 1, day);
  return dateObj.getFullYear() === year && dateObj.getMonth() === (month - 1) && dateObj.getDate() === day;
}

/**
 * Checks if date is in the future.
 * @param {string} dateStr Date string (YYYY-MM-DD)
 * @return {boolean} True if future, false otherwise
 */
function isFutureDate(dateStr) {
  var parts = dateStr.split('-');
  var dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return dateObj.getTime() > today.getTime();
}

/**
 * Compares two dates.
 * @param {string} dateStr1 First date string (YYYY-MM-DD)
 * @param {string} dateStr2 Second date string (YYYY-MM-DD)
 * @return {number} Negative if date1 < date2, positive if date1 > date2, 0 if equal
 */
function compareDates(dateStr1, dateStr2) {
  var p1 = dateStr1.split('-');
  var p2 = dateStr2.split('-');
  var d1 = new Date(p1[0], p1[1] - 1, p1[2]);
  var d2 = new Date(p2[0], p2[1] - 1, p2[2]);
  return d1.getTime() - d2.getTime();
}
