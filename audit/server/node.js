const bunyan = require('bunyan');
const levelup = require('levelup');
const leveldown = require('leveldown');
const encoding = require('encoding-down');
const kad = require('@kadenceproject/kadence');
const BatNode = require('../../batnode').BatNode;
const kad_bat = require('../../kadence_plugin').kad_bat;
const seed = require('../../constants').SEED_NODE;
const fileUtils = require('../../utils/file').fileSystem;
const fs = require('fs');

// Create first node... Will act as a seed node
const kadnode1 = new kad.KademliaNode({
  transport: new kad.HTTPTransport(),
  storage: levelup(encoding(leveldown('./db'))),
  contact: seed[1]
});

kadnode1.identity = seed[0]
kadnode1.listen(seed[1].port)
kadnode1.plugin(kad_bat)

const batnode1 = new BatNode(kadnode1) // create batnode
kadnode1.batNode = batnode1 // tell kadnode who its batnode is

const nodeConnectionCallback = (serverConnection) => {
  serverConnection.on('end', () => {
    console.log('end')
  });

  serverConnection.on('data', (receivedData, error) => {
    if (error) { throw error; }
    receivedData = JSON.parse(receivedData)
    if (receivedData.messageType === "RETRIEVE_FILE") {
      batnode1.readFile(`./hosted/${receivedData.fileName}`, (err, data) => {
        if (err) { throw err; }
        serverConnection.write(data)
      });
    } else if (receivedData.messageType === "STORE_FILE") {
      let { fileName } = receivedData;

      batnode1.kadenceNode.iterativeStore(fileName, [batnode1.kadenceNode.identity.toString(), batnode1.kadenceNode.contact], (innerError, stored) => {
        if (innerError) { throw innerError; }
        let fileContent = new Buffer(receivedData.fileContent)

        batnode1.writeFile(`./hosted/${fileName}`, fileContent, (err) => {
          if (err) { throw err; }
          serverConnection.write(JSON.stringify({messageType: "SUCCESS"}))
        });
      });
    } else if (receivedData.messageType === "AUDIT_FILE") {
      fs.readFile(`./hosted/${receivedData.fileName}`, (innerErr, data) => {
        if (innerErr) { throw innerErr; }
        const shardSha1 = fileUtils.sha1HashData(data);
        serverConnection.write(shardSha1);
      });
    }
  });
}


batnode1.createServer(1756, '127.0.0.1', nodeConnectionCallback)
console.log('BatNode address: ',kadnode1.batNode.address)
console.log('KadNode contact: ',kadnode1.contact)
