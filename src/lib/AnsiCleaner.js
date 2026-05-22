// src/lib/AnsiCleaner.js

class AnsiCleaner {
  constructor() {
    // Regex to strip ANSI escape codes.
    // This regex is a common one used for this purpose.
    // It looks for CSI (Control Sequence Introducer) followed by
    // zero or more parameters and a final command character.
    this.ansiRegex = /\x1b\[[0-9;]*[mGKHJ]/g;
  }

  /**
   * Strips ANSI escape codes from a given string.
   * @param {string} text The string to clean.
   * @returns {string} The cleaned string without ANSI codes.
   */
  clean(text) {
    if (typeof text !== 'string') {
      return text;
    }
    return text.replace(this.ansiRegex, '');
  }
}

module.exports = AnsiCleaner;
