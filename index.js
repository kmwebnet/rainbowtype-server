const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const multer = require('multer');
const devicedata = JSON.parse(fs.readFileSync('./devices.json', 'utf8'));

const options = {
    key:    fs.readFileSync( '/usr/src/app/certs/server.key' ),
    cert:   fs.readFileSync( '/usr/src/app/certs/server.chain' ),
    ca:     [fs.readFileSync( '/usr/src/app/certs/signer-ca.crt' ), fs.readFileSync( '/usr/src/app/certs/root-ca.crt' )],
    requestCert: true,
    rejectUnauthorized: true
};

const httpsserver = https.createServer( options, app );
const expressWs = require('express-ws')(app, httpsserver);

const connections = new Set()

// WEB debug console
app.get('/debug', (req, res) => res.sendFile('/usr/src/app/index.html'));

// FW image service
app.use('/fw', express.static('fw'));

var storage = multer.diskStorage(
  {
      destination: 'fw/',
      filename: function ( req, file, cb ) {
          //req.body is empty...
          //How could I get the new_file_name property sent from client here?
          cb( null, file.originalname );
      }
  }
);


//upload
app.post('/fw', multer({ storage: storage }).single('file'), (req, res) => {
  const filename = req.file.filename
  console.log (filename);
  res.send(filename + ': finished');
});


function isJSON(sJSON){
    try {
        JSON.parse(sJSON);
        return true;
    } catch (e) {
        return false;
    }
}

let getObject = (a) => {
  if (a in devicedata) {
    return devicedata[a];
  } else {
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
  };  

// express-ws websocket
app.ws('/rtserver', function(ws, req) {
    console.log("connect:" + ws._socket.getPeerCertificate().subject.CN);
    id = ws._socket.getPeerCertificate().subject.CN;
    ws.id = id;

    connections.add(ws);

    keepAlive(ws);


    ws.on('message', function(msg) {
  
    // get self ID
    cid = ws._socket.getPeerCertificate().subject.CN;

    //command decode 

    let decodesuccess = true;

    if ( isJSON(msg))
    {

        var a = JSON.parse(msg);

        let tempdata = getObject(a.serial);
        fs.writeFileSync('./devices.json', JSON.stringify(devicedata));



        switch (a.action){
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
            connections.forEach(function(client) {

                if (client.id === a.serial) 
                {
                    console.log("rtServer sent to "+ a.serial + " message: ACK");
                    var smsg = { serial:a.serial, action: "ack" };
                    client.send(JSON.stringify({...smsg, ...tempdata}));
                }
            });

        break;

        //device response

        case "updatecompleted":
            devicedata[a.serial]["data"] = "none";
            devicedata[a.serial]["request"] = "none"; 
            fs.writeFileSync('./devices.json', JSON.stringify(devicedata));
        break;    

        case "urlupdated":
          devicedata[a.serial]["data"] = "none";
          devicedata[a.serial]["request"] = "none"; 
          fs.writeFileSync('./devices.json', JSON.stringify(devicedata));
        break;    

        case "otaaccepted":
          devicedata[a.serial]["data"] = "none";
          devicedata[a.serial]["request"] = "none"; 
          fs.writeFileSync('./devices.json', JSON.stringify(devicedata));
        break;            

        case "publickeyissued":
            devicedata[a.serial]["request"] = "pkeyissued";
            devicedata[a.serial]["data"] = a.data;
            devicedata[a.serial]["keynum"] = a.keynum;
            fs.writeFileSync('./devices.json', JSON.stringify(devicedata));            
        break;      

        case "pkeyissued":
        break;      


        case "finishcertrefresh":
            devicedata[a.serial]["data"] = "none";
            devicedata[a.serial]["request"] = "none";
            fs.writeFileSync('./devices.json', JSON.stringify(devicedata));       
        break;

        //rtClient request
        case "setstate":
            console.log("setstate:");

            devicedata[a.serial]["data"] = a.data;
            devicedata[a.serial]["request"] = a.request;
            devicedata[a.serial]["state"] = a.state;

            fs.writeFileSync('./devices.json', JSON.stringify(devicedata));       
        break;
        case "getallstate":

            //send private message
            connections.forEach(function(client) {

            if (client.id === a.serial) 
            {
              var smsg = { serial:a.serial, action: "responseallstate" };
              client.send(JSON.stringify({...smsg, ...devicedata}));
            }
            });
      
        break;

        }

    if (!decodesuccess){
    // send message except me (other JSON data)
    connections.forEach(function(client) {
        if (client.id !== cid) 
        {
            console.log(cid + " sent to "+ client.id + " message: "+ msg);
            client.send(msg);
        }
    });
    };

    }
    else
    {
    decodesuccess = false;
    // send message except me (non JSON data)
    connections.forEach(function(client) {

        if (client.id !== cid) 
        {
            console.log(cid + " sent to "+ client.id + " message: "+ msg);
            client.send(msg);
        }
    });
    }
    });

    ws.on('close', () => {
    // The closed connection is removed from the set
        console.log(id + " connection close");
        connections.delete(ws)

        
    })


});


// run server
httpsserver.listen(3000, () => console.log('Listening on port 3000'));