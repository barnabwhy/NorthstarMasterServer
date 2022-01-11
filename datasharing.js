const fs = require('fs').promises;
const http = require('http');
const https = require('https');
const crypto = require("crypto");

// 0=Starting, 1=Syncing, 2=Running
let state = 0

const accounts = require("./shared/accounts.js") 

let instanceListPath = process.env.INSTANCE_LIST || "./instances.json"


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
        return {}
    }
}

// used to verify password of the masterserver remote stuf
function getOwnPassword() {
    return new Promise(async (resolve, reject) => {
        try {
            let data = await fs.readFile(instanceListPath);
            let self = JSON.parse(data).find(i => i.isSelf);
            resolve(self.password);
        } catch(e) {
            reject(e);
        }
    });
}

// gets a list of instances from the json file
function getAllKnownInstances() {
    return new Promise(async (resolve, reject) => {
        try {
            let data = await fs.readFile(instanceListPath);
            resolve(JSON.parse(data));
        } catch(e) {
            reject(e);
        }
    });
}

// sends a post req to all instances to attempt data propagation
async function broadcastMessage(endpoint, data) {
    instances = await getAllKnownInstances();
    instances.forEach(instance => {
        if(instance.isSelf) return;

        // console.log(instance.name + " | " + instance.host+":"+instance.port+"/instancing/"+endpoint)

        const algorithm = "aes-256-cbc"; 

        const initVector = crypto.randomBytes(16);
        const Securitykey = crypto.scryptSync(instance.password, 'salt', 32);
        
        const cipher = crypto.createCipheriv(algorithm, Securitykey, initVector);
        let encryptedData = cipher.update(JSON.stringify({ password: instance.password, payload: data }), "utf-8", "hex");
        encryptedData += cipher.final("hex");
        
        const options = {
            host: instance.host.split("://")[1],
            path: "/instancing/"+endpoint,
            port: instance.port,
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ iv: initVector, data: encryptedData })
        }

        let lib = http;
        if(instance.host.startsWith("https://")) {
            lib = https;
        }
        const req = lib.request(options, res => {
            // console.log(`Status Code: ${res.statusCode}`)
            
            // res.on('data', d => {
            //     console.log(d.toString())
            // })
        })
        
        req.write(JSON.stringify({ iv: initVector, data: encryptedData.toString() }));
        
        req.on('error', error => {
            console.error(error)
        })

        req.end()
    });
}

// used to verify password of the masterserver remote stuf
function getOwnState() {
    return state
}
function setOwnState(val) {
    state = val
}


module.exports = {
    decryptPayload,
    getOwnState,
    setOwnState,
    getOwnPassword,
    getAllKnownInstances,
    serverAdd: function(data) { broadcastMessage("serverAdd", data) },
    serverRemove: function(data) { broadcastMessage("serverRemove", data) },
    serverUpdate: function(data) { broadcastMessage("serverUpdate", data) },
    playerUpdate: function(data) { broadcastMessage("playerUpdate", data) },
    playerUpdateCurrentServer: function(data) { broadcastMessage("playerUpdateCurrentServer", data) },
    playerWritePersistenceBaseline: function(data) { broadcastMessage("playerWritePersistenceBaseline", data) }
}