"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_ws_1 = __importDefault(require("express-ws"));
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const devicedata = JSON.parse(fs_1.default.readFileSync('./devices.json', 'utf8'));
const options = {
    key: fs_1.default.readFileSync('/usr/src/app/certs/server.key'),
    cert: fs_1.default.readFileSync('/usr/src/app/certs/server.chain'),
    ca: [fs_1.default.readFileSync('/usr/src/app/certs/signer-ca.crt'), fs_1.default.readFileSync('/usr/src/app/certs/root-ca.crt')],
    requestCert: true,
    rejectUnauthorized: true,
};
const eapp = express_1.default();
//expressWs(eapp);
const httpsserver = https_1.default.createServer(options, eapp);
const { app } = express_ws_1.default(eapp, httpsserver, { wsOptions: { maxPayload: 0x200000 } });
var connections = new Set();
// WEB debug console
app.get('/debug', (req, res) => res.sendFile('/usr/src/app/index.html'));
// FW image service
app.use('/fw', express_1.default.static('fw'));
function isJSON(sJSON) {
    try {
        JSON.parse(sJSON);
        return true;
    }
    catch (e) {
        return false;
    }
}
let getObject = (a) => {
    if (a in devicedata) {
        return devicedata[a];
    }
    else {
        devicedata[a] = JSON.parse(JSON.stringify(devicedata.defaultdevice));
        return devicedata[a];
    }
};
function keepAlive(ws) {
    setTimeout(() => {
        if (ws.readyState === 1) {
            ws.send("");
        }
        keepAlive(ws);
    }, 3000);
}
;
// express-ws websocket for upload
app.ws('/fw', function (ws, req) {
    ws.on('message', function (msg) {
        if (!fs_1.default.existsSync('fw/')) {
            fs_1.default.mkdirSync('fw/');
        }
        // get peer ID
        const bufserial = Uint8Array.prototype.slice.call(msg, 0, 18);
        const serial = bufserial.toString();
        // get firmware
        const bufdata = Uint8Array.prototype.slice.call(msg, 18);
        fs_1.default.writeFileSync('fw/' + serial, new Uint8Array(bufdata), 'binary');
        ws.send(serial + '\'s furmware recieved');
    });
});
// express-ws websocket
app.ws('/rtserver', function (ws, req) {
    console.log("connect:" + (req.socket).getPeerCertificate(true).subject.CN);
    let tws = ws;
    tws.id = (req.socket).getPeerCertificate(true).subject.CN;
    connections.add(tws);
    keepAlive(tws);
    ws.on('message', function (msg) {
        // get self ID
        let cid = (req.socket).getPeerCertificate(true).subject.CN;
        msg = msg.toString();
        //command decode 
        let decodesuccess = true;
        if (isJSON(msg)) {
            var a = JSON.parse(msg);
            let tempdata = getObject(a.serial);
            fs_1.default.writeFileSync('./devices.json', JSON.stringify(devicedata));
            switch (a.action) {
                default:
                    decodesuccess = false;
                    break;
                // send status message from server to device 
                case "bootup":
                    //request responce
                    switch (devicedata[a.serial]["request"]) {
                        default:
                            decodesuccess = false;
                            break;
                        case "ota":
                            console.log("ota request to " + a.serial);
                            break;
                        case "pubkey":
                            console.log("pubkey request to " + a.serial);
                            break;
                        case "cert":
                            console.log("cert request to " + a.serial);
                            break;
                        case "url":
                            console.log("url set request to " + a.serial);
                            break;
                        case "none":
                            console.log("none request to " + a.serial);
                            break;
                    }
                    //send state
                    switch (devicedata[a.serial]["state"]) {
                        default:
                            decodesuccess = false;
                            break;
                        case "offlineboot":
                            console.log(a.serial + " is offline boot mode.");
                            break;
                        case "onlineboot":
                            console.log(a.serial + " is online boot mode.");
                            break;
                        case "forcefwdownload":
                            console.log(a.serial + " is force firmware download mode.");
                            break;
                        case "bootprohibited":
                            console.log(a.serial + " is boot prohobited mode.");
                            break;
                    }
                    //send private message
                    connections.forEach(function (client) {
                        if (client.id === a.serial) {
                            console.log("rtServer sent to " + a.serial + " message: ACK");
                            var smsg = { serial: a.serial, action: "ack" };
                            client.send(JSON.stringify({ ...smsg, ...tempdata }));
                        }
                    });
                    break;
                //device response
                case "updatecompleted":
                    devicedata[a.serial]["data"] = "none";
                    devicedata[a.serial]["request"] = "none";
                    fs_1.default.writeFileSync('./devices.json', JSON.stringify(devicedata));
                    break;
                case "urlupdated":
                    devicedata[a.serial]["data"] = "none";
                    devicedata[a.serial]["request"] = "none";
                    fs_1.default.writeFileSync('./devices.json', JSON.stringify(devicedata));
                    break;
                case "otaaccepted":
                    devicedata[a.serial]["data"] = "none";
                    devicedata[a.serial]["request"] = "none";
                    fs_1.default.writeFileSync('./devices.json', JSON.stringify(devicedata));
                    break;
                case "publickeyissued":
                    devicedata[a.serial]["request"] = "pkeyissued";
                    devicedata[a.serial]["data"] = a.data;
                    devicedata[a.serial]["keynum"] = a.keynum;
                    fs_1.default.writeFileSync('./devices.json', JSON.stringify(devicedata));
                    break;
                case "pkeyissued":
                    break;
                case "finishcertrefresh":
                    devicedata[a.serial]["data"] = "none";
                    devicedata[a.serial]["request"] = "none";
                    fs_1.default.writeFileSync('./devices.json', JSON.stringify(devicedata));
                    break;
                //rtClient request
                case "setstate":
                    console.log("setstate:");
                    devicedata[a.serial]["data"] = a.data;
                    devicedata[a.serial]["request"] = a.request;
                    devicedata[a.serial]["state"] = a.state;
                    fs_1.default.writeFileSync('./devices.json', JSON.stringify(devicedata));
                    break;
                case "getallstate":
                    //send private message
                    connections.forEach(function (client) {
                        if (client.id === a.serial) {
                            var smsg = { serial: a.serial, action: "responseallstate" };
                            client.send(JSON.stringify({ ...smsg, ...devicedata }));
                        }
                    });
                    break;
            }
            if (!decodesuccess) {
                // send message except me (other JSON data)
                connections.forEach(function (client) {
                    if (client.id !== cid) {
                        console.log(cid + " sent to " + client.id + " message: " + msg);
                        client.send(msg);
                    }
                });
            }
            ;
        }
        else {
            decodesuccess = false;
            // send message except me (non JSON data)
            connections.forEach(function (client) {
                if (client.id !== cid) {
                    console.log(cid + " sent to " + client.id + " message: " + msg);
                    client.send(msg);
                }
            });
        }
    });
    ws.on('close', () => {
        // The closed connection is removed from the set
        console.log(tws.id + " connection close");
        connections.delete(tws);
    });
});
// run server
httpsserver.listen(3000, () => console.log('Listening on port 3000'));
