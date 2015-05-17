var net = require('net');
var os = require('os');
var spawn = require('child_process').spawn;
var events = require('events');
var fs = require('fs');
var crypto = require('crypto');

var workers = {};
var addr = {};
var log = [];
var global = new events.EventEmitter();
var jobs = {};

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
        case 'end':
          if(data.status == 'error') {
            log.push('Job %s ended with failure (err, out) : %s\n%s', data.job, data.err, data.output);
          } else {
            log.push('Job %s ended : %s', data.job, data.output);
          }
          delete jobs[data.job];
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
  var cmdArgs = cmd.toString().trim().split(' ');
  switch(cmdArgs[0]) {
    case '':
      break;
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
    case 'spread':
      if(typeof cmdArgs[1] !== 'string') {
        console.log('Usage : spread file');
        break;
      }
      fs.readFile(cmdArgs[1], function(err, rawTargets) {
        if(err !== null) {
          console.log('Unknown file %s', cmdArgs[1]);
        } else {
          var targets = rawTargets.toString().trim().split('\n');
          targets.forEach(function(target) {
            newJob(['node spreader.js', target, addr.ip, addr.port].join(' '));
          });
        }
      });
      break;
    case 'jobs':
      for(var id in jobs) {
        console.log('%s (%s) : %s', id, jobs[id].status, jobs[id].cmd);
      }
      break;
    case 'start':
      newJob(cmdArgs.slice(1).join(' '));
      break;
    default:
      console.log('Unknown command "%s"', cmdArgs[0]);
  }
  process.stdout.write('> ');
}

function newJob(cmd) {
  var id = crypto.pseudoRandomBytes(8).toString('hex');
  jobs[id] = {
    cmd: cmd,
    status: 'prelaunch'
  };
  global.emit('jobUpdate');
}

server.listen(function() {
  addr.port = server.address().port;
  addr.ip = os.hostname();
  console.log('Stated server at %s:%d', addr.ip, addr.port);
  process.stdout.write('Starting local worker...');
  var worker = spawn('node', ['worker.js', addr.ip, addr.port]);
  worker.on('error', function(err) {
    log.push('Local worker error : ' + err);
  });
  worker.on('end', function(code) {
    log.push('Local worker ended with status ' + code);
  });
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

global.on('jobUpdate', function() {

});
