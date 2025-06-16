document.addEventListener('DOMContentLoaded', () => {
    const delayInput = document.getElementById('delayInput');
    const shortcutInput = document.getElementById('shortcutInput');
    const saveButton = document.getElementById('saveButton');
    const siteStatus = document.getElementById('siteStatus');
    const activateSiteButton = document.getElementById('activateSiteButton');
    const deactivateSiteButton = document.getElementById('deactivateSiteButton');
    const statusMessage = document.getElementById('statusMessage');
    const nextAutosaveTimerDisplay = document.getElementById('nextAutosaveTimer'); // New element

    let currentTabOrigin = null; // Stores the origin of the current active tab
    let autosaveTimerInterval = null; // To store the interval ID
    let currentDelayMinutes = 5; // Default delay, will be loaded from storage

    // Helper to get the origin from a URL
    function getOriginFromUrl(urlString) {
      try {
        const url = new URL(urlString);
        return url.origin;
      } catch (e) {
        console.error("Invalid URL:", urlString, e);
        return null;
      }
    }

    // Function to format seconds into MM:SS
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Function to start or restart the autosave countdown timer
    function startAutosaveTimer(delayMinutes) {
        if (autosaveTimerInterval) {
            clearInterval(autosaveTimerInterval);
        }

        currentDelayMinutes = delayMinutes;

        if (currentDelayMinutes <= 0) {
            nextAutosaveTimerDisplay.textContent = "Autosave timer disabled (delay is 0)";
            return;
        }

        let remainingSeconds = currentDelayMinutes * 60; // Start fresh countdown

        const updateTimerDisplay = () => {
            nextAutosaveTimerDisplay.textContent = `Next autosave in: ${formatTime(remainingSeconds)}`;
            remainingSeconds--;

            if (remainingSeconds < 0) {
                // When timer hits 0, it means an alarm just fired or is about to
                // Reset to the full delay and let the background script handle the actual action.
                nextAutosaveTimerDisplay.textContent = `Autosaving now... ${formatTime(0)}`;
                // Briefly show "Saving..." then restart the countdown
                setTimeout(() => {
                    remainingSeconds = currentDelayMinutes * 60;
                    updateTimerDisplay(); // Call immediately to update
                }, 1000); // Show "Saving..." for 1 second
            }
        };

        // Call immediately to show initial time, then set interval
        updateTimerDisplay();
        autosaveTimerInterval = setInterval(updateTimerDisplay, 1000);
    }


    // Function to update the site activation status display
    function updateSiteStatus(isActivated, origin) {
        if (!origin) {
            siteStatus.textContent = 'Autosave cannot be managed for this page (e.g., chrome:// or file:// page).';
            activateSiteButton.disabled = true;
            deactivateSiteButton.disabled = true;
        } else if (isActivated) {
            siteStatus.innerHTML = `<span class="text-green-600 font-semibold">Autosave is ACTIVE</span> for: <br class="sm:hidden">${origin}`;
            activateSiteButton.disabled = true;
            deactivateSiteButton.disabled = false;
        } else {
            siteStatus.innerHTML = `<span class="text-red-600 font-semibold">Autosave is INACTIVE</span> for: <br class="sm:hidden">${origin}`;
            activateSiteButton.disabled = false;
            deactivateSiteButton.disabled = true;
        }
    }

    // Load saved global settings and current tab status when the page loads
    chrome.storage.sync.get(['delay', 'shortcut'], (data) => {
        // Set default values if not already saved
        delayInput.value = data.delay !== undefined ? data.delay : 5;
        shortcutInput.value = data.shortcut !== undefined ? data.shortcut : 'Ctrl+S';
        currentDelayMinutes = data.delay !== undefined ? data.delay : 5; // Update currentDelayMinutes

        // Start the timer with the loaded delay
        startAutosaveTimer(currentDelayMinutes);


        // Get the current active tab's URL to determine its origin and status
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const currentUrl = tabs[0].url;
                currentTabOrigin = getOriginFromUrl(currentUrl);

                if (currentTabOrigin) {
                    // Ask background script for activation status
                    chrome.runtime.sendMessage({
                        action: "getActivationStatus",
                        origin: currentTabOrigin
                    }, (response) => {
                        updateSiteStatus(response.isActivated, currentTabOrigin);
                    });
                } else {
                    updateSiteStatus(false, null); // Cannot manage for this URL
                }
            } else {
                updateSiteStatus(false, null); // No active tab found
            }
        });
    });

    // Save global settings when the button is clicked
    saveButton.addEventListener('click', () => {
        const delay = parseFloat(delayInput.value);
        const shortcut = shortcutInput.value.trim();

        if (isNaN(delay) || delay < 0) {
            statusMessage.textContent = 'Please enter a valid number for delay (0 or greater).';
            statusMessage.className = 'mt-4 text-center text-sm font-medium text-red-600';
            return;
        }
        if (!shortcut) {
            statusMessage.textContent = 'Please enter a keyboard shortcut.';
            statusMessage.className = 'mt-4 text-center text-sm font-medium text-red-600';
            return;
        }

        // Send a message to the background script to update settings and schedule alarm
        chrome.runtime.sendMessage({
            action: "updateSettings",
            delay: delay,
            shortcut: shortcut
        }, (response) => {
            if (response && response.status === "settings updated") {
                statusMessage.textContent = 'Global settings saved and alarm updated!';
                statusMessage.className = 'mt-4 text-center text-sm font-medium text-green-600';
                startAutosaveTimer(delay); // Restart timer with new delay
            } else {
                statusMessage.textContent = 'Failed to save global settings.';
                statusMessage.className = 'mt-4 text-center text-sm font-medium text-red-600';
            }
            // Clear message after a few seconds
            setTimeout(() => {
                statusMessage.textContent = '';
            }, 3000);
        });
    });

    // Activate autosave for the current site
    activateSiteButton.addEventListener('click', () => {
        if (currentTabOrigin) {
            chrome.runtime.sendMessage({
                action: "activateForOrigin",
                origin: currentTabOrigin
            }, (response) => {
                if (response && response.status === "activated") {
                    updateSiteStatus(true, currentTabOrigin);
                    statusMessage.textContent = `Autosave activated for ${currentTabOrigin}!`;
                    statusMessage.className = 'mt-4 text-center text-sm font-medium text-green-600';
                } else {
                    statusMessage.textContent = 'Failed to activate autosave.';
                    statusMessage.className = 'mt-4 text-center text-sm font-medium text-red-600';
                }
                setTimeout(() => { statusMessage.textContent = ''; }, 3000);
            });
        }
    });

    // Deactivate autosave for the current site
    deactivateSiteButton.addEventListener('click', () => {
        if (currentTabOrigin) {
            chrome.runtime.sendMessage({
                action: "deactivateForOrigin",
                origin: currentTabOrigin
            }, (response) => {
                if (response && response.status === "deactivated") {
                    updateSiteStatus(false, currentTabOrigin);
                    statusMessage.textContent = `Autosave deactivated for ${currentTabOrigin}!`;
                    statusMessage.className = 'mt-4 text-center text-sm font-medium text-orange-600';
                } else {
                    statusMessage.textContent = 'Failed to deactivate autosave.';
                    statusMessage.className = 'mt-4 text-center text-sm font-medium text-red-600';
                }
                setTimeout(() => { statusMessage.textContent = ''; }, 3000);
            });
        }
    });
});