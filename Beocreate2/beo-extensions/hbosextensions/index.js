// EXTENSIONS FOR HIFIBERRYOS

var execSync = require("child_process").execSync;
var exec = require("child_process").exec;
var fs = require("fs");
const axios = require('axios');
const cheerio = require('cheerio');

var debug = beo.debug;
var version = require("./package.json").version;

const extensionDir = "/data/extensions/";
	
var defaultSettings = {
	"privacyApprovedByUser": false
};
var settings = JSON.parse(JSON.stringify(defaultSettings));
	
var inferredSettings = {
	externalMetadata: false,
	usageData: false
};
	
var descriptions = {
	externalMetadata: null,
	usageData: null
}

var extensions = []

	
beo.bus.on('general', function(event) {
	if (event.header == "activatedExtension") {
		if (event.content.extension == "hbosextensions") {
			console.error("Read config");

			result = parseExtensionsConfig("/etc/extensions.conf",true);
			if (typeof result === 'boolean') {
				// all fine
			} else {
    				console.error(result);
			}
			
			try {
        			fs.accessSync("/etc/extensions-contrib.conf", fs.constants.F_OK);
				result = parseExtensionsConfig("/etc/extensions-contrib.conf",true);
                        	if (typeof result === 'boolean') {
                                	// all fine
                        	} else {
                                	console.error(result);
                        	}
    			} catch (error) {}

			updateUI();

		}
	}
});

beo.bus.on('hbosextensions', function(event) {

	console.log(event);
		
	if (event.header == "start") {
		ext = getExtensionData(event.content.name);
		console.log(ext);
		if (ext.status=="not installed") {
			console.log("install");
			beo.sendToUI("hbosextensions", {header: "processState", content: {"state": "Installing "+ext.fullname}});
			modifyExtension(event.content.name,"install");
			beo.sendToUI("hbosextensions", {header: "processState", content: {"state": "Creating container(s) for "+ext.fullname}});
                        modifyExtension(event.content.name,"createcontainer");
		}
		beo.sendToUI("hbosextensions", {header: "processState", content: {"state": "Starting "+ext.fullname}});
		console.log("start");
		modifyExtension(event.content.name,"start");
		console.log("done");
		updateUI();
	}
	if (event.header == "stop") {
		ext = getExtensionData(event.content.name);
		beo.sendToUI("hbosextensions", {header: "processState", content: {"state": "Stopping "+ext.fullname}});
                modifyExtension(event.content.name,"stop");
		updateUI();
        }
	if (event.header == "update") {
                ext = getExtensionData(event.content.name);
                beo.sendToUI("hbosextensions", {header: "processState", content: {"state": "Updating "+ext.fullname}});
                modifyExtension(event.content.name,"update");
                updateUI();
        }
	if (event.header == "cleanup") {
		beo.sendToUI("hbosextensions", {header: "processState", content: {"state": "Removing unused data"}});
		cleanup();
		updateUI();
	}

});

function updateUI() {
	result = updateExtensionStatus()
	if (typeof result === 'boolean') {
        	// all fine
        } else {
                console.error(result);
        }

	beo.sendToUI("hbosextensions", {header: "status", content: {"list": extensions, "sizes": getDockerSizes() }});
}


function getExtensionData(name) {
    return extensions.find(obj => obj.name === name);
}

function cleanup() {
	execSync('docker system prune -a --force');
}

	

function parseExtensionsConfig(filePath,clear) {
    try {
        // Read the file contents synchronously
        const data = fs.readFileSync(filePath, 'utf8');

        // Split the file contents by lines
        const lines = data.trim().split('\n');

        let extension = {};
 	if (clear) {
	    extensions = [];
        }

        // Iterate over each line
        lines.forEach(line => {
            if (line.startsWith('[')) {
                if (Object.keys(extension).length !== 0) {
                    extensions.push(extension);
                    extension = {};
                }
                extension.name = line.substring(1, line.length - 1);
            } else {
                const keyValue = line.split('=');
                if (keyValue.length === 2) {
                    let [key, value] = keyValue;
                    key = key.trim().toLowerCase();
                    if (key === "name") {
                        key = "fullname";
                    }
                    extension[key] = value.trim();
                }
            }
        });

        // Push the last extension to the array
        if (Object.keys(extension).length !== 0) {
            extensions.push(extension);
        }

	    console.log(extensions);

	for (ext of extensions) {
		const dir = extensionDir + ext.name;
		try {
        		fs.accessSync(dir+"/.git", fs.constants.F_OK | fs.constants.R_OK);
			const options = { cwd: dir };
			tags = "";
			try {
				tags = execSync("git describe --tags --abbrev=0",options).toString().trim();
			} catch (error) { }
			if (tags == "") {
				ext.version="unknown"
			} else {
			        ext.version = cleanupVersion(tags);
			}
    		} catch (err) { 
			ext.version = "not installed"
		}
	};



	console.log(extensions);

	checkGithubVersions();

        return true;
    } catch (error) {
        // Return the error if any
        return error;
    }
}


function updateExtensionStatus() {
    try {
        // Execute the command synchronously
        const stdout = execSync("/opt/hifiberry/bin/extensions", { encoding: 'utf-8' });

        const extensionLines = stdout.trim().split('\n');

        extensionLines.forEach(line => {
            const [extensionName, status] = line.split(':').map(str => str.trim());
            const extension = extensions.find(ext => ext.name === extensionName);
            if (extension) {
                extension.status = status;
            } else {
		console.log("Extension "+extension+" unknown");
            }
        });

        return true; // Indicate success
    } catch (error) {
        return error; // Return error
    }
}


function compareVersions(version1, version2) {
    // Split version strings into arrays of numeric parts
    const parts1 = version1.substring(1).split('.').map(Number);
    const parts2 = version2.substring(1).split('.').map(Number);

    // Compare each numeric part
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 < part2) {
            return -1;
        } else if (part1 > part2) {
            return 1;
        }
    }

    // If all parts are equal, versions are equal
    return 0;
}


function parseGithubUrl(url) {
    // Parse the URL
    const parsedUrl = new URL(url);

    // Split the pathname component of the URL
    const pathComponents = parsedUrl.pathname.split('/').filter(Boolean);

    // Extract owner and repository name
    const owner = pathComponents[0];
    const repo = pathComponents[1];

    // Extract branch (default to 'master' if not specified)
    const branch = pathComponents[2] || 'master';

    return { owner, repo };
}


async function checkGithubVersions() {
    try {
        const fetchPromises = extensions.map(async (ext) => {
            const { owner, repo } = parseGithubUrl(ext.repository);
            let tag = "";
            try {
        	// Fetch GitHub tags page HTML
        	const response = await axios.get(`https://github.com/${owner}/${repo}/tags`);

        	// Load HTML content into Cheerio
        	const $ = cheerio.load(response.data);

        	// Extract tag names
        	const tags = [];
        	$('a[href^="/' + owner + '/' + repo + '/releases/tag/"]').each((index, element) => {
            		const tagName = $(element).text().trim();
            		tags.push(tagName);
        	});

		const version = tags.find(str => str.toLowerCase().startsWith('v'));
		ext.githubversion=cleanupVersion(version);

		if ((ext.version != "not installed") && compareVersions(ext.githubversion,ext.version)==1) {
			ext.updateAvailable=true;
		} else {
			ext.updateAvailable=false;
		}

            } catch (error) {
                console.error("Error:", error);
            }
            return tag;
        });

        // Wait for all fetches to complete
        const tags = await Promise.all(fetchPromises);
	console.log(extensions);
    } catch (error) {
        console.error("Error:", error);
    } 
    updateUI();
}


function modifyExtension(extensionName, extensionCommand, reportError = true) {
    const escapedName = encodeURIComponent(extensionName);

    // Construct the command to call /bin/xxx with the argument x
    const command = `/opt/hifiberry/bin/extensions ${extensionCommand} ${escapedName}`;

    try {
        // Execute the command
        const stdout = execSync(command);

        // If the command is successful, stdout will contain the output
        console.log(`Command output: ${stdout.toString()}`);
    } catch (error) {
        // Catch and handle the error
        console.error(`Error executing command: ${error.message}`);
        // Optionally, handle error.stdout and error.stderr if needed
	message="";
        if (error.stdout) {
            message += error.stdout	   
            console.log(`Stdout: ${error.stdout.toString()}`);
        }
        if (error.stderr) {
	    message += error.stdout
            console.error(`Stderr: ${error.stderr.toString()}`);
        }
	if (reportError) {
	    beo.sendToUI("hbosextensions", {header: "error", content: {"message": message}});
	    setTimeout(() => {
		    console.log("error");
            }, 10000); 
            console.log("error");
        }

    }
}

// Function to convert bytes to human-readable format
function bytesToHumanReadable(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}


function getDockerSizes() {
    try {
        // Get size of running containers
        const containerSizeOutput = execSync('docker ps -s --format "{{.Size}}"', { encoding: 'utf-8' });
        const containerSizes = containerSizeOutput.trim().split('\n').map(size => parseSize(size));

        // Get size of images
        const imageSizeOutput = execSync('docker images --format "{{.Size}}"', { encoding: 'utf-8' });
        const imageSizes = imageSizeOutput.trim().split('\n').map(size => parseSize(size));

        // Calculate total sizes
        const totalContainerSize = containerSizes.reduce((acc, val) => acc + val, 0);
        const totalImageSize = imageSizes.reduce((acc, val) => acc + val, 0);

        // Return sizes
        return {
            containerSize: bytesToHumanReadable(totalContainerSize),
            imageSize: bytesToHumanReadable(totalImageSize)
        };
    } catch (error) {
        throw new Error("Error getting Docker sizes: " + error.message);
    }
}

function parseSize(size) {
    const match = size.match(/^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)(?:\s*\(virtual\s*\d+(?:\.\d+)?[a-zA-Z]*\))?/);
    if (match) {
        const [, sizeStr, unit] = match;
        return parseFloat(sizeStr) * getSizeMultiplier(unit.toUpperCase());
    } else {
        return 0;
    }
}


// Function to convert bytes to human-readable format
function bytesToHumanReadable(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to get size multiplier based on unit
function getSizeMultiplier(unit) {
    switch (unit) {
        case 'KB':
            return 1024;
        case 'MB':
            return 1024 * 1024;
        case 'GB':
            return 1024 * 1024 * 1024;
        case 'TB':
            return 1024 * 1024 * 1024 * 1024;
        default:
            return 1; // Bytes
    }
}

function cleanupVersion(str) {
    if (!str) {
        return '';
    }

    if (str.startsWith('v') || str.startsWith('V')) {
        // Remove the first character
        return str.substring(1);
    }
    // Return the original string if it doesn't start with 'v' or 'V'
    return str;
}

module.exports = {
	version: version,
};

