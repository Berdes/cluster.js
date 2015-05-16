var net = require('net');
var os = require('os');
var spawn = require('child_process').spawn;
var events = require('events');

var workers = {};
var addr = {};
var log = [];
var global = new events.EventEmitter();

var server = net.createServer(function(socket) {
  var ip = socket.remoteAddress;
  if(workers[ip] !== undefined) {
    // worker already spawned, kill it
    socket.write(JSON.stringify({action: 'kill'}));
    socket.end();
  } else {
    workers[ip] = {socket: socket};
    socket.on('data', function(rawData) {
      var data = JSON.parse(rawData);
      switch(data.action) {
        case 'log':
          log.push(ip + ' : ' + data.log);
          break;
        default:
          log.push('Unknown action ' + data.action);
      }
    });
    socket.on('close', function() {
      delete workers[ip];
      global.emit('deletedWorker');
    });
  }
});

function execCmd(cmd) {
  var cmdArgs = cmd.toString().slice(0, -1).split(' ');
  switch(cmdArgs[0]) {
    case 'l':
    case 'log':
      log.forEach(function(v) {
        process.stdout.write(v + '\n');
      });
      log = [];
      break;
    case 'ls':
    case 'list':
      var i = 0;
      for(var ip in workers) {
        console.log(ip);
        i++;
      }
      console.log('Total %d', i);
      break;
    case 'kill':
      var w = workers[cmdArgs[1]];
      if(w !== undefined) {
        w.socket.write(JSON.stringify({action: 'kill'}));
      } else {
        console.log('Unknown worker %s', cmdArgs[1]);
      }
      break;
    default:
      console.log('Unknown command "%s"', cmdArgs[0]);
  }
  process.stdout.write('> ');
}

server.listen(function() {
  addr.port = server.address().port;
  addr.ip = os.hostname();
  console.log('Stated server at %s:%d', addr.ip, addr.port);
  process.stdout.write('Starting local worker...');
  spawn('node', ['worker.js', addr.ip, addr.port]);
  process.stdout.write(' done\n');
  process.stdout.write('> ');
  process.stdin.on('data', execCmd);
});

process.stdin.on('end', function() {
  process.stdout.write('Stopping all workers...');
  var i = 0;
  for(var ip in workers) {
    workers[ip].socket.write(JSON.stringify({action: 'kill'}));
    i++;
  }
  if(i == 0) {
    process.stdout.write(' done\n');
    process.exit();
  } else {
    global.on('noWorker', function() {
      process.stdout.write(' done\n');
      process.exit();
    });
  }
});

global.on('deletedWorker', function() {
  var i = 0;
  for(var _ in workers) {
    i++;
  }
  if(i == 0) {
    global.emit('noWorker');
  }
});
