var net = require('net');
var os = require('os');
var spawn = require('child_process').spawn;
var events = require('events');
var fs = require('fs');
var crypto = require('crypto');
var util = require('util');

var workers = {};
var addr = {};
var log = [];
var global = new events.EventEmitter();
var jobs = {};

function send(sock, mess) {
  sock.write(JSON.stringify(mess)+'\0\1\2\3');
}

var server = net.createServer(function(socket) {
  var ip = socket.remoteAddress;
  if(workers[ip] !== undefined) {
    // worker already spawned, kill it
    send(socket, {action: 'kill'});
    socket.end();
  } else {
    var w = {socket: socket, init: false, jobs: 0};
    workers[ip] = w;
    var buffer = "";
    socket.on('data', function(rawData) {
      buffer += rawData;
      var slices = buffer.split('\0\1\2\3');
      while(slices.length > 1) {
        (function(raw) {
          var data = JSON.parse(raw);
          switch(data.action) {
            case 'log':
              log.push(ip + ' : ' + data.log);
              break;
            case 'end':
              if(data.status == 'error') {
                log.push(util.format('Job %s ended with failure (err, out) : %s\n%s',
                      data.job, data.err, data.output));
              } else {
                log.push(util.format('Job %s ended : %s', data.job, data.output));
              }
              delete jobs[data.job];
              w.jobs--;
              break;
            case 'startInfos':
              w.init = true;
              w.cpus = data.data.cpus;
              w.hostname = data.data.hostname;
              w.load = data.data.load;
              w.who = data.data.who;
              global.emit('jobUpdate');
              break;
            case 'infos':
              w.load = data.data.load;
              w.who = data.data.who;
              break;
            default:
              log.push('Unknown action ' + data.action);
          }
        })(slices.shift());
      }
      buffer = slices[0];
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
        var w = workers[ip];
        if(w.init) {
          console.log('%s : %d %d %d %s/%s',
              w.hostname,
              Math.round(w.load[0]*100)/100,
              Math.round(w.load[1]*100)/100,
              Math.round(w.load[2]*100)/100,
              w.jobs,
              w.cpus);
        } else {
          console.log(ip);
        }
        i++;
      }
      console.log('Total %d', i);
      break;
    case 'kill':
      var w = workers[cmdArgs[1]];
      if(w !== undefined) {
        send(w.socket, {action: 'kill'});
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
          console.log('Unknown file %s (%s)', cmdArgs[1], err);
        } else {
          var targets = rawTargets.toString().trim().split('\n');
          targets.forEach(function(target) {
            newJob(['node spreader.js', target, addr.ip, addr.port].join(' '));
          });
        }
      });
      break;
    case 'j':
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

function newJob(cmd, affinity) {
  var id = crypto.pseudoRandomBytes(8).toString('hex');
  jobs[id] = {
    cmd: cmd,
    status: 'prelaunch',
    affinity: affinity
  };
  global.emit('jobUpdate');
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
    send(workers[ip].socket, {action: 'kill'});
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
  var toLaunch = [];
  for(var id in jobs) {
    if(jobs[id].status == 'prelaunch' && jobs[id].affinity === undefined) {
      toLaunch.push(id);
    }
  }
  for(var ip in workers) {
    if(toLaunch.length == 0) {
      break;
    }
    var w = workers[ip];
    if(w.init) {
      while(w.jobs < w.cpus - 1 && toLaunch.length > 0) {
        w.jobs++;
        var jId = toLaunch.pop();
        var j = jobs[jId];
        send(w.socket, {action: 'start', cmd: j.cmd, jobId: jId});
        j.status = 'running';
      }
    }
  }
});
