// EXTENSIONS FOR HIFIBERRYOS

var execSync = require("child_process").execSync;
var exec = require("child_process").exec;
var fs = require("fs");

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
				ext.version="unknown version"
			} else {
			        ext.version = tags;
			}
    		} catch (err) { 
			ext.version = "not installed"
		}
	};



	console.log(extensions);

        // Return the extensions array
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


function modifyExtension(extensionName,extensionCommand) {
    const escapedName = encodeURIComponent(extensionName);

    // Construct the command to call /bin/xxx with the argument x
    const command = `/opt/hifiberry/bin/extensions ${extensionCommand} ${escapedName}`;

    // Execute the command
    execSync(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Command stderr: ${stderr}`);
            return;
        }
    });
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

function startExtension(name) {
    modifyExtension(name,"start");
}

function stopExtension(name) {
    modifyExtension(name,"stop");
}


module.exports = {
	version: version,
};

