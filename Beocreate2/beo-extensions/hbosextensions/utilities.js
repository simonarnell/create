const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;

debug=1

function updateAttribValueConfig(configFilePath, replacements) {
  // Read the configuration file
  fs.readFile(configFilePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading the file:', err);
      return;
    }

    // Split the file content into lines
    let lines = data.split(/\r?\n/);
    let fileChanged = false;

    // Process each line
    const updatedLines = lines.map(line => {
      // Iterate over each replacement key and attempt to replace it in the current line
      for (let key of Object.keys(replacements)) {
        let regex = new RegExp(`^\\s*${key}\\s*=\\s*".*?"\\s*(#.*)?$|^\\s*${key}\\s*=\\s*.*?\\s*(#.*)?$`, 'i');
        if (regex.test(line)) {
          let newValue = replacements[key];
          let newLine = `${key} = "${newValue}"  # Updated by Beocreate extension`;
          // Check if the line actually needs to be updated
          if (!line.includes(`${key} = "${newValue}"`)) {
            fileChanged = true;
            return newLine;
          }
        }
      }
      return line; // Return the original line if no replacements were made
    });

    // Only write back to the file if changes were made
    if (fileChanged) {
      const updatedData = updatedLines.join('\n');
      fs.writeFile(configFilePath, updatedData, 'utf8', (err) => {
        if (err) {
          console.error('Error writing the file:', err);
          return;
        }
        console.log('The configuration file has been updated.');
      });
    } else {
      console.log('No changes were made to the configuration file.');
    }
  });
  return fileChanged
}


/**
 * Checks the running status of a specified service and updates the service's enabled status
 * in a global settings object. The function asynchronously executes an external command to
 * inquire about the service's status. It then uses a callback to relay the outcome of the
 * status check to the caller.
 *
 * @param {string} serviceName - The name of the service whose status is being queried.
 * @param {Function} callback - A callback function that is called with the result of the status check.
 *                              The callback receives a single boolean argument:
 *                              - `true` if the service is running (enabled),
 *                              - `false` if the service is not running (disabled) or if an error occurred.
 * 
 * Usage example:
 * getExtensionStatus('spotifyd', function(isRunning) {
 *     if (isRunning) {
 *         console.log("The service is running.");
 *     } else {
 *         console.log("The service is not running.");
 *     }
 * });
 *
 * Note: This function assumes the existence of a global `settings` object where the
 *       service's enabled state is stored. It uses the `/opt/hifiberry/bin/extensions`
 *       script with the 'status' command to check the service status. Therefore, this
 *       script must exist and be executable on the system. The function also logs errors
 *       to the console if the `exec` command fails for any reason.
 */
function getExtensionStatus(serviceName, callback) {
    exec(`/opt/hifiberry/bin/extensions status ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return callback(false);
        }
        if (stdout.trim() === "running") {
            settings[`${serviceName}Enabled`] = true;
            callback(true);
        } else {
            settings[`${serviceName}Enabled`] = false;
            callback(false);
        }
    });
}


/**
 * Changes the status of a specified service by starting, stopping, or restarting it, and updates
 * the service's status in the settings object. This function executes an external command
 * to change the service status and uses a callback to notify the caller of the operation's outcome.
 *
 * @param {string} serviceName - The name of the service to be modified.
 * @param {string} action - The action to perform on the service. Expected values are "start", "stop", or "restart".
 * @param {Function} callback - A callback function that is invoked after attempting
 *                              to modify the service's status. It receives two arguments:
 *                              a boolean indicating if the operation was successful,
 *                              and a boolean indicating if there was an error.
 *
 * Usage example:
 * setExtensionStatus('spotifyd', 'restart', function(success, error) {
 *     if (error) {
 *         console.log("There was an error modifying the service.");
 *     } else if (success) {
 *         console.log("Service modification successful.");
 *     }
 * });
 *
 * Note: This function relies on the presence of a global `settings` object to store the
 *       service's status, and a global `debug` flag for logging. It utilizes the
 *       `/opt/hifiberry/bin/extensions` script for service management, which must exist
 *       and be executable on the system.
 */
function setExtensionStatus(serviceName, action, callback) {

    // Map true to 'start' and false to 'stop'
    if (action === true) {
        action = 'start';
    } else if (action === false) {
        action = 'stop';
    }

    // Validate the action parameter
    if (!['start', 'stop', 'restart'].includes(action)) {
        console.error('Invalid action %s specified. Expected "start", "stop", or "restart".', action);
        return callback(false, true);
    }

    // For "restart" action, call the separate restart function
    if (action === 'restart') {
        restartExtension(serviceName, callback);
    } else {
        // For "start" or "stop" actions, execute the specified action
        exec(`/opt/hifiberry/bin/extensions ${action} ${serviceName}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                settings[`${serviceName}Enabled`] = action !== 'stop';
                return callback(false, true);
            }
            settings[`${serviceName}Enabled`] = action !== 'stop';
            if (debug) console.log(`${serviceName} ${action}ed.`); // Note: "started", "stopped"
            callback(true, false);
        });
    }
}

/**
 * Restarts the specified service by stopping and then starting it if it is currently running.
 * @param {string} serviceName - The name of the service to be restarted.
 * @param {Function} callback - A callback function to be called after the restart operation completes.
 */
function restartExtension(serviceName, callback) {
    exec(`/opt/hifiberry/bin/extensions status ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error checking the status of the service: ${error}`);
            return callback(false, true);
        }
        if (stdout.trim() === "running") {
            // Service is running, so stop and start it
            exec(`/opt/hifiberry/bin/extensions stop ${serviceName}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error stopping the service: ${error}`);
                    settings[`${serviceName}Enabled`] = false;
                    return callback(false, true);
                }
                // If stopping is successful, start the service
                exec(`/opt/hifiberry/bin/extensions start ${serviceName}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error starting the service: ${error}`);
                        settings[`${serviceName}Enabled`] = false;
                        return callback(false, true);
                    }
                    settings[`${serviceName}Enabled`] = true;
                    if (debug) console.log(`${serviceName} restarted.`);
                    callback(true, false);
                });
            });
        } else {
            // Service is not running, no need to restart it
            if (debug) console.log(`${serviceName} is not currently running.`);
            callback(false, false);
        }
    });
}


function parseConfigFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, { encoding: 'utf-8' });
        const config = {};
        let currentSection = null;

        // Split the file content into lines and iterate over them
        const lines = data.split(/\r?\n/);
        lines.forEach(line => {
            // Match sections like [SectionName]
            const sectionMatch = line.match(/^\[(.+)\]$/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                config[currentSection] = {};
            } else {
                // Match key-value pairs like key = value
                const keyValueMatch = line.match(/^([^#]+?)\s*=\s*(.*?)\s*(?:#.*)?$/);
                if (keyValueMatch) {
                    const key = keyValueMatch[1].trim();
                    let value = keyValueMatch[2].trim();

                    // Remove leading and trailing quotes from the value
                    value = value.replace(/^["']|["']$/g, '');

                    // Attempt to convert numeric and boolean values
                    if (!isNaN(value) && value !== '') value = Number(value);
                    else if (value.toLowerCase() === 'true') value = true;
                    else if (value.toLowerCase() === 'false') value = false;

                    // Assign key-value pair to the current section
                    if (currentSection) {
                        config[currentSection][key] = value;
                    }
                }
            }
        });

        return config;
    } catch (err) {
        console.error('Error reading the file:', err);
        return null; // or throw an error depending on your use case
    }
}

/**
 * Applies changes to a configuration file while preserving comments and the original file structure.
 * This function reads the existing configuration from a file, applies specified changes (addition, update, removal of options),
 * and writes the modified configuration back to the file, keeping comments intact.
 *
 * Usage:
 * applyChangesPreservingComments('path/to/config.conf', [
 *     { section: "global", option: "username", remove: true }, // Removes this option
 *     { section: "global", option: "newOption", value: "newValue" }, // Adds or updates this option
 *     { section: "newSection", option: "newKey", value: "someValue" } // Adds a new section and option if not exist
 * ]);
 *
 * Note: To mark an option for removal, include `remove: true` in the change object.
 *       To add or update an option, provide the `value` for the option.
 *
 * @param {string} filePath - The full path to the configuration file to be modified.
 * @param {Array<Object>} changes - An array of objects specifying the changes to be applied. Each object
 *                                   must include a `section` and an `option`. If `remove` is true, the
 *                                   specified option is removed. Otherwise, it's added or updated with the provided `value`.
 */
function applyChangesPreservingComments(filePath, changes) {
    const lines = fs.readFileSync(filePath, { encoding: 'utf-8' }).split(/\r?\n/);
    let currentSection = null;
    let outputLines = [];

    // Process each line, preserving structure and comments
    lines.forEach(line => {
        const trimmedLine = line.trim();
        const isSection = trimmedLine.startsWith('[') && trimmedLine.endsWith(']');
        const isKeyValue = trimmedLine && !isSection && !trimmedLine.startsWith('#');

        if (isSection) {
            currentSection = trimmedLine.slice(1, -1);
            outputLines.push(line); // Add section line as is
        } else if (isKeyValue) {
            const [key, value] = line.split('=').map(part => part.trim());
            const changeIndex = changes.findIndex(change => change.section === currentSection && change.option === key);
            if (changeIndex > -1) {
                const change = changes[changeIndex];
                if (change.remove) {
                    // Skip adding this line to effectively remove the key
                } else {
                    // Replace or add the key with possibly updated value
                    // Determine if the original value was quoted
                    const quotedValue = typeof change.value === 'string' ? `"${change.value}"` : change.value;
                    outputLines.push(`${key} = ${quotedValue}`);
                }
                changes.splice(changeIndex, 1); // Remove the processed change
            } else {
                outputLines.push(line); // Add unmodified line
            }
        } else {
            outputLines.push(line); // Add comment lines or empty lines as is
        }
    });

    // Process any remaining changes that might add new keys
    changes.forEach(change => {
        if (!change.remove) {
            const quotedValue = typeof change.value === 'string' ? `"${change.value}"` : change.value;
            const sectionExists = outputLines.some(line => line.trim() === `[${change.section}]`);
            if (!sectionExists) {
                outputLines.push(`[${change.section}]`);
            }
            outputLines.push(`${change.option} = ${quotedValue}`);
        }
    });

    // Write back the updated configuration
    fs.writeFileSync(filePath, outputLines.join('\n'), { encoding: 'utf-8' });
}


module.exports = {
    updateAttribValueConfig,
    getExtensionStatus,
    setExtensionStatus,
    restartExtension,
    parseConfigFile, 
    applyChangesPreservingComments
};
