var net = require('net');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var os = require('os');

var masterHost = process.argv[2];
var masterPort = process.argv[3];

function send(sock, mess) {
  sock.write(JSON.stringify(mess)+'\0\1\2\3');
}

var socket = net.connect(masterPort, masterHost, function() {
  var buffer = "";
  socket.on('data', function(rawData) {
    buffer += rawData;
    var slices = buffer.split('\0\1\2\3');
    while(slices.length > 1) {
      (function(raw) {
        var data = JSON.parse(raw);
        switch(data.action) {
          case 'kill':
            process.exit();
            break;
          case 'start':
            exec(data.cmd, function(err, stdout, stderr) {
              if(err !== null) {
                send(socket, {
                  action: 'end',
                  job: data.jobId,
                  status: 'error',
                  err: err+'\n'+stderr.toString(),
                  output: stdout.toString()
                });
              } else {
                send(socket, {
                  action: 'end',
                  job: data.jobId,
                  status: 'ok',
                  output: stdout.toString()
                });
              }
            });
            break;
          default:
            send(socket, {action: 'log', log: 'Unknown action ' + data.action});
        }
      })(slices.shift());
    }
    buffer = slices[0];
  });
  socket.on('close', function() {
    process.exit();
  });

  send(socket, {action: 'log', log: 'Connected'});
  send(socket, {action: 'startInfos', data: {
    cpus: os.cpus().length,
    hostname: os.hostname(),
    load: os.loadavg(),
    who: parseInt(execSync('who | wc -l').toString().trim())
  }});
  setInterval(function() {
    send(socket, {action: 'infos', data: {
      load: os.loadavg(),
      who: parseInt(execSync('who | wc -l').toString().trim())
    }});
  }, 10000);
});

process.on('uncaughtException', function(err) {
  send(socket, {action: 'log', log: 'Worker uncaughtException : ' + err});
  process.exit();
});
