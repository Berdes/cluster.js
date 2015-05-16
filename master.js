var net = require('net');
var os = require('os');

function jsWrite(s, obj, cb) {
  if(cb !== undefined) {
    s.write(JSON.stringify(obj, cb));
  } else {
    s.write(JSON.stringify(obj));
  }
}

var workers = {};
var addr = {};

var server = net.createServer(function(socket) {
  var ip = socket.remoteAddress;
  if(workers[ip] !== undefined) {
    // worker already spawned, kill it
    jsWrite(socket, {action: 'kill'});
  } else {
    workers[ip] = {socket: socket};
    socket.on('data', function(data) {
      console.log('Recieved datas from %s : %s', ip, data);
    });
    socket.on('close', function() {
      workers[ip] = undefined;
    });
  }
});

server.listen(function() {
  addr.port = server.address().port;
  addr.ip = os.hostname();
});
