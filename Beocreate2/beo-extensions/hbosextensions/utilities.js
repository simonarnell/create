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

function setExtensionStatus(serviceName, enabled, callback) {
    const action = enabled ? "start" : "stop";
    exec(`/opt/hifiberry/bin/extensions ${action} ${serviceName}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            settings[`${serviceName}Enabled`] = false;
            return callback(false, true);
        }
        settings[`${serviceName}Enabled`] = enabled;
        if (enabled) {
            if (debug) console.log(`${serviceName} enabled.`);
        } else {
            if (debug) console.log(`${serviceName} disabled.`);
        }
        callback(enabled);
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

module.exports = {
    updateAttribValueConfig,
    getExtensionStatus,
    setExtensionStatus,
    parseConfigFile
};
