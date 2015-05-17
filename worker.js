var net = require('net');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var os = require('os');

var masterHost = process.argv[2];
var masterPort = process.argv[3];

var socket = net.connect(masterPort, masterHost, function() {
  socket.on('data', function(rawData) {
    var data = JSON.parse(rawData);
    switch(data.action) {
      case 'kill':
        process.exit();
        break;
      case 'start':
        exec(data.cmd, function(err, stdout, stderr) {
          if(err !== null) {
            socket.write(JSON.stringify({
              action: 'end',
              job: data.jobId,
              status: 'error',
              err: err+'\n'+stderr.toString(),
              output: stdout.toString()
            }));
          } else {
            socket.write(JSON.stringify({
              action: 'end',
              job: data.jobId,
              status: 'ok',
              output: stdout.toString()
            }));
          }
        });
        break;
      default:
        socket.write(JSON.stringify({action: 'log', log: 'Unknown action ' + data.action}));
    }
  });
  socket.on('close', function() {
    process.exit();
  });

  socket.write(JSON.stringify({action: 'log', log: 'Connected'}));
  socket.write(JSON.stringify({action: 'startInfos', data: {
    cpus: os.cpus().length,
    load: os.loadavg(),
    who: parseInt(execSync('who | wc -l').toString().trim())
  }}));
  setInterval(function() {
    socket.write(JSON.stringify({action: 'infos', data: {
      load: os.loadavg(),
      who: parseInt(execSync('who | wc -l').toString().trim())
    }}));
  }, 10000);
});

process.on('uncaughtException', function(err) {
  socket.write(JSON.stringify({action: 'log', log: 'Worker uncaughtException : ' + err}));
  process.exit();
});
