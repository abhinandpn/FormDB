/**
 * Talrop Employee Details Verification System
 * Utilities Module (Utilities.gs)
 *
 * Senior Full Stack Engineer: Antigravity AI
 * Date: 2026-07-19
 */

/**
 * Escapes special characters to prevent cross-site scripting (XSS) attacks.
 * @param {string} text Raw text string
 * @return {string} Escaped HTML-safe string
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return text;
  }
  
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  
  return text.replace(/[&<>"'`=\/]/g, function(m) {
    return map[m];
  });
}

/**
 * Sanitizes input data. Trims whitespace and escapes HTML characters.
 * @param {Object} data Raw input data object (key-value pairs)
 * @return {Object} Sanitized data object
 */
function sanitizeInputData(data) {
  if (data === null || data === undefined) {
    return data;
  }
  
  var sanitized = {};
  
  for (var key in data) {
    if (data.hasOwnProperty(key)) {
      var value = data[key];
      
      if (typeof value === 'string') {
        // Trim whitespace and escape HTML characters
        var trimmed = value.trim();
        sanitized[key] = escapeHtml(trimmed);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively handle nested objects if any exist
        sanitized[key] = sanitizeInputData(value);
      } else {
        // Leave boolean/number values unchanged
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}

/**
 * Factory helper to construct structured JSON API response objects.
 * Matches requested formats.
 * @param {boolean} success Transaction outcome status
 * @param {string} message Description text
 * @param {string} [submissionId] Optional generated tracking ID
 * @return {Object} Response object
 */
function createJsonResponse(success, message, submissionId) {
  var response = {
    success: success,
    message: message
  };
  
  if (success && submissionId) {
    response.submissionId = submissionId;
  }
  
  return response;
}
