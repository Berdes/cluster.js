var net = require('net');

var masterHost = process.argv[2];
var masterPort = process.argv[3];

var socket = net.connect(masterPort, masterHost, function() {
  socket.on('data', function(rawData) {
    var data = JSON.parse(rawData);
    switch(data.action) {
      case 'kill':
        process.exit();
        break;
      default:
        socket.write(JSON.stringify({action: 'log', log: 'Unknown action ' + data.action}));
    }
  });
  socket.on('close', function() {
    process.exit();
  });

  socket.write(JSON.stringify({action: 'log', log: 'Connected'}));
});
