const fs = require('fs');
const path = require('path');

/**
 * Helper function to load JSON files without using import assertions
 * This is needed for compatibility with Vercel deployments
 * 
 * @param {string} filePath - Path to the JSON file relative to the project root
 * @returns {any} - Parsed JSON data
 */
function loadJson(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    const data = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading JSON file ${filePath}:`, error);
    return {};
  }
}

module.exports = {
  loadJson
}; 