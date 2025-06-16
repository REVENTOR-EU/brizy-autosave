// background.js
// This is the service worker that runs in the background.
// It handles alarms, managing activated sites, and injecting content scripts.

let shortcutDetails = null; // Stores the parsed shortcut details
const ALARM_NAME = 'shortcutAlarm';
const ACTIVATED_ORIGINS_STORAGE_KEY = 'activated_origins';

/**
 * Helper function to get the origin from a URL.
 * @param {string} urlString The full URL.
 * @returns {string|null} The origin (e.g., "https://www.example.com") or null if invalid.
 */
function getOriginFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.origin;
  } catch (e) {
    console.error("Invalid URL:", urlString, e);
    return null;
  }
}

/**
 * Parses a shortcut string (e.g., "Ctrl+Shift+A") into key code and modifier flags.
 * @param {string} shortcutString The shortcut string from the options page.
 * @returns {object|null} An object with `key`, `code`, `keyCode`, `ctrlKey`, `altKey`, `shiftKey`, `metaKey`, or null if invalid.
 */
function parseShortcut(shortcutString) {
  if (!shortcutString) return null;

  const parts = shortcutString.toLowerCase().split('+').map(p => p.trim());
  const details = {
    key: '',
    code: '',
    keyCode: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false // Command key on Mac, Windows key on Windows
  };

  let mainKeyFound = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    switch (part) {
      case 'ctrl':
      case 'control':
        details.ctrlKey = true;
        break;
      case 'alt':
        details.altKey = true;
        break;
      case 'shift':
        details.shiftKey = true;
        break;
      case 'meta':
      case 'command':
      case 'windows':
        details.metaKey = true;
        break;
      default:
        // The last part is typically the actual key
        details.key = part.toUpperCase(); // Store as uppercase for consistency
        mainKeyFound = true;
        // Note: Getting keyCode and code reliably for all keys can be complex.
        // For simplicity, we'll primarily rely on 'key'.
        // For common alphanumeric keys, charCodeAt(0) works, but not for special keys.
        // A more robust solution would involve a lookup table.
        if (part.length === 1) { // Only for single character keys
            details.keyCode = part.toUpperCase().charCodeAt(0);
            details.code = `Key${part.toUpperCase()}`;
        } else { // Handle some common special keys
            switch (part) {
                case 'enter': details.keyCode = 13; details.code = 'Enter'; break;
                case 'escape': details.keyCode = 27; details.code = 'Escape'; break;
                case 'space': details.keyCode = 32; details.code = 'Space'; break;
                case 'tab': details.keyCode = 9; details.code = 'Tab'; break;
                case 'f1': details.keyCode = 112; details.code = 'F1'; break;
                case 'f2': details.keyCode = 113; details.code = 'F2'; break;
                case 'f3': details.keyCode = 114; details.code = 'F3'; break;
                case 'f4': details.keyCode = 115; details.code = 'F4'; break;
                case 'f5': details.keyCode = 116; details.code = 'F5'; break;
                case 'f6': details.keyCode = 117; details.code = 'F6'; break;
                case 'f7': details.keyCode = 118; details.code = 'F7'; break;
                case 'f8': details.keyCode = 119; details.code = 'F8'; break;
                case 'f9': details.keyCode = 120; details.code = 'F9'; break;
                case 'f10': details.keyCode = 121; details.code = 'F10'; break;
                case 'f11': details.keyCode = 122; details.code = 'F11'; break;
                case 'f12': details.keyCode = 123; details.code = 'F12'; break;
                case 'arrowup': details.keyCode = 38; details.code = 'ArrowUp'; break;
                case 'arrowdown': details.keyCode = 40; details.code = 'ArrowDown'; break;
                case 'arrowleft': details.keyCode = 37; details.code = 'ArrowLeft'; break;
                case 'arrowright': details.keyCode = 39; details.code = 'ArrowRight'; break;
                // Add more cases as needed
                default:
                    // Fallback: Use the string itself as key, code, and keyCode 0
                    details.keyCode = 0; // Indicate unknown keyCode
                    details.code = part.charAt(0).toUpperCase() + part.slice(1); // Capitalize first letter
            }
        }
        break;
    }
  }

  // If no main key was found (e.g., just "Ctrl+Shift"), return null.
  if (!mainKeyFound && !details.ctrlKey && !details.altKey && !details.shiftKey && !details.metaKey) {
      return null;
  }
  return details;
}

/**
 * Schedules an alarm with the given delay. Clears any existing alarm first.
 * @param {number} delayInMinutes The delay in minutes.
 */
function scheduleAlarm(delayInMinutes) {
  // Clear any existing alarm to avoid duplicates
  chrome.alarms.clear(ALARM_NAME);

  if (delayInMinutes > 0) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: delayInMinutes,
      periodInMinutes: delayInMinutes // Make it repeating for autosave
    });
    console.log(`Alarm scheduled for ${delayInMinutes} minutes, repeating.`);
  } else {
    console.log("Delay is 0 or less, alarm not scheduled.");
  }
}

// Listener for messages from the options page (popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    const { delay, shortcut } = request;

    // Save settings to storage
    chrome.storage.sync.set({ delay: delay, shortcut: shortcut }, () => {
      console.log('Settings saved:', { delay, shortcut });
    });

    // Parse and store shortcut details
    shortcutDetails = parseShortcut(shortcut);
    console.log('Parsed shortcut details:', shortcutDetails);

    // Schedule or reschedule the alarm
    if (delay && delay > 0 && shortcutDetails) {
      scheduleAlarm(delay);
    } else {
      chrome.alarms.clear(ALARM_NAME);
      console.log("Alarm cleared due to invalid delay or shortcut.");
    }
    sendResponse({ status: "settings updated" });
  } else if (request.action === "getActivationStatus") {
    // Respond with whether the given origin is activated
    chrome.storage.sync.get([ACTIVATED_ORIGINS_STORAGE_KEY], (data) => {
      const activatedOrigins = data[ACTIVATED_ORIGINS_STORAGE_KEY] || [];
      const isActivated = activatedOrigins.includes(request.origin);
      sendResponse({ isActivated: isActivated });
    });
    return true; // Indicate that sendResponse will be called asynchronously
  } else if (request.action === "activateForOrigin") {
    // Add the origin to the activated list
    chrome.storage.sync.get([ACTIVATED_ORIGINS_STORAGE_KEY], (data) => {
      const activatedOrigins = new Set(data[ACTIVATED_ORIGINS_STORAGE_KEY] || []);
      if (request.origin) {
        activatedOrigins.add(request.origin);
      }
      chrome.storage.sync.set({ [ACTIVATED_ORIGINS_STORAGE_KEY]: Array.from(activatedOrigins) }, () => {
        console.log(`Origin activated: ${request.origin}`);
        sendResponse({ status: "activated" });
      });
    });
    return true;
  } else if (request.action === "deactivateForOrigin") {
    // Remove the origin from the activated list
    chrome.storage.sync.get([ACTIVATED_ORIGINS_STORAGE_KEY], (data) => {
      let activatedOrigins = new Set(data[ACTIVATED_ORIGINS_STORAGE_KEY] || []);
      if (request.origin) {
        activatedOrigins.delete(request.origin);
      }
      chrome.storage.sync.set({ [ACTIVATED_ORIGINS_STORAGE_KEY]: Array.from(activatedOrigins) }, () => {
        console.log(`Origin deactivated: ${request.origin}`);
        sendResponse({ status: "deactivated" });
      });
    });
    return true;
  }
});

// Listener for when the alarm fires
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("Alarm fired!");

    if (!shortcutDetails) {
      console.error("No shortcut details available to press.");
      return;
    }

    // Get the currently active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.warn("No active tab found.");
        return;
      }
      const activeTab = tabs[0];
      const activeTabOrigin = getOriginFromUrl(activeTab.url);

      if (!activeTabOrigin) {
        console.warn("Could not get origin for active tab:", activeTab.url);
        return;
      }

      // Check if this origin is activated for autosave
      chrome.storage.sync.get([ACTIVATED_ORIGINS_STORAGE_KEY], (data) => {
        const activatedOrigins = data[ACTIVATED_ORIGINS_STORAGE_KEY] || [];
        if (activatedOrigins.includes(activeTabOrigin)) {
          console.log(`Autosave is active for ${activeTabOrigin}. Attempting to press shortcut...`);
          // Inject the content script into the active tab
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            function: simulateKeyPress, // Function to be injected
            args: [shortcutDetails] // Arguments to pass to the injected function
          })
          .then(() => console.log("Content script injected and shortcut simulation attempted."))
          .catch(error => console.error("Failed to inject content script:", error));
        } else {
          console.log(`Autosave not active for ${activeTabOrigin}. Shortcut not pressed.`);
        }
      });
    });
  }
});

/**
 * Injected function to simulate a key press on the active page.
 * This function runs in the context of the content page.
 * @param {object} details - Object containing key, code, keyCode, and modifier flags.
 */
function simulateKeyPress(details) {
  console.log("Attempting to simulate key press:", details);

  if (!details || (!details.key && !details.keyCode)) { // Ensure at least key or keyCode is present
    console.error("Invalid shortcut details for simulation.");
    return;
  }

  // Create and dispatch a 'keydown' event
  const keydownEvent = new KeyboardEvent('keydown', {
    key: details.key,
    code: details.code || `Key${details.key}`, // Fallback for code
    keyCode: details.keyCode || 0, // Fallback for keyCode
    ctrlKey: details.ctrlKey,
    altKey: details.altKey,
    shiftKey: details.shiftKey,
    metaKey: details.metaKey,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(keydownEvent);
  console.log('Keydown event dispatched.');

  // Create and dispatch a 'keyup' event
  const keyupEvent = new KeyboardEvent('keyup', {
    key: details.key,
    code: details.code || `Key${details.key}`,
    keyCode: details.keyCode || 0,
    ctrlKey: details.ctrlKey,
    altKey: details.altKey,
    shiftKey: details.shiftKey,
    metaKey: details.metaKey,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(keyupEvent);
  console.log('Keyup event dispatched.');

  // Optional: Trigger 'keypress' for compatibility, though less common for modern apps
  // Keypress events are typically only fired for character-generating keys (e.g., 'a', '1', not 'Ctrl', 'Shift')
  if (details.key.length === 1 && !details.ctrlKey && !details.altKey && !details.metaKey) {
      const keypressEvent = new KeyboardEvent('keypress', {
          key: details.key,
          charCode: details.key.charCodeAt(0),
          keyCode: details.key.charCodeAt(0),
          bubbles: true,
          cancelable: true
      });
      document.dispatchEvent(keypressEvent);
      console.log('Keypress event dispatched.');
  }

  // Note: Directly simulating keyboard events this way may not always trigger
  // native browser shortcuts or complex web application listeners, due to
  // security restrictions and how different frameworks handle events.
  // This approach is best for simple key inputs or events listened to by basic JS.
}

// Initialize settings and schedule initial alarm when the background script starts
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed or updated. Loading saved settings...');
  chrome.storage.sync.get(['delay', 'shortcut'], (data) => {
    // Default to 5 minutes for autosave and Ctrl+S
    const savedDelay = data.delay !== undefined ? data.delay : 5;
    const savedShortcut = data.shortcut !== undefined ? data.shortcut : 'Ctrl+S';
    console.log('Loaded settings:', { savedDelay, savedShortcut });

    // Store parsed shortcut details globally
    shortcutDetails = parseShortcut(savedShortcut);

    // Schedule the alarm if valid settings are found
    if (savedDelay > 0 && shortcutDetails) {
        scheduleAlarm(savedDelay);
    }
  });
});