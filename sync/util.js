const crypto = require('crypto');

const util = require('util');
const dns = require('dns');
const lookup = util.promisify(dns.lookup);

const fs = require("fs");
let instanceListPath = process.env.INSTANCE_LIST || "./instances.json"
let instances = JSON.parse(fs.readFileSync(instanceListPath, 'utf-8'));

fs.watch(instanceListPath, (eventType, filename) => {
    try {
        if(eventType == "change") {
            let fileData = fs.readFileSync(instanceListPath, 'utf-8');
            let fileJson = JSON.parse(fileData);
            instances = fileJson;
        }
    } catch(e) {
        console.log(e)
    }
});

// gets a list of instances from the json file
function getAllKnownInstances() {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(instances);
        } catch(e) {
            reject(e);
        }
    });
}
// gets a specific instance from the json file
function getInstanceById(id) {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(instances.find(inst => inst.id == id));
        } catch(e) {
            reject(e);
        }
    });
}
// gets own instance from the json file based on id env var
function getOwnInstance() {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(instances.find(inst => inst.id == process.env.DATASYNC_OWN_ID));
        } catch(e) {
            reject(e);
        }
    });
}
// gets a list of resolved addresses from the hosts in the json file
function getAllKnownAddresses() {
    return new Promise(async (resolve, reject) => {
        try {
            resolve( await Promise.all( instances.map( async instance => (await lookup(instance.host.split("://")[1])).address ) ) );
        } catch(e) {
            reject(e);
        }
    });
}
// gets a resolved addresses for one of the hosts in the json file
function getInstanceAddress(instance) {
    return new Promise(async (resolve, reject) => {
        try {
            resolve( (await lookup(instance.host)).address );
        } catch(e) {
            reject(e);
        }
    });
}
// used to verify password of the masterserver remote stuf
function getOwnPassword() {
    return new Promise(async (resolve, reject) => {
        try {
            let self = instances.find(inst => inst.id == process.env.DATASYNC_OWN_ID);
            resolve(self.password);
        } catch(e) {
            reject(e);
        }
    });
}
// encrypts payloads
async function encryptPayload(body, password) {
    try {
        if(!password) password = await getOwnPassword()

        let timestamp = body.lastModified || Date.now()

        const algorithm = "aes-256-cbc"; 

        const initVector = crypto.randomBytes(16);
        const Securitykey = crypto.scryptSync(password, 'salt', 32);
        
        const cipher = crypto.createCipheriv(algorithm, Securitykey, initVector);
        let encryptedData = cipher.update(JSON.stringify({ password, payload: body, timestamp }), "utf-8", "hex");
        encryptedData += cipher.final("hex");

        return { iv: initVector, data: encryptedData.toString() }
    } catch(e) {
        return {} // don't ever error cause i'm nice
    }
}
// decrypts encrypted payloads
async function decryptPayload(body, password) {
    try {
        if(!password) password = await getOwnPassword()

        const encryptedData = body.data;
        const initVector = body.iv;

        const algorithm = "aes-256-cbc"; 
        const Securitykey = crypto.scryptSync(password, 'salt', 32);

        const decipher = crypto.createDecipheriv(algorithm, Securitykey, Buffer.from(initVector));
        let decryptedData = decipher.update(encryptedData, "hex", "utf-8");
        decryptedData += decipher.final("utf8");
        let json = JSON.parse(decryptedData);
        return json
    } catch(e) {
        return {} // don't ever error cause i'm nice
    }
}

module.exports = {
    getAllKnownInstances,
    getInstanceById,
    getOwnInstance,
    getOwnPassword,
    getInstanceAddress,
    getAllKnownAddresses,
    encryptPayload,
    decryptPayload
}