var net = require('net');
var exec = require('child_process').exec;
var fs = require('fs');

var targetHost = process.argv[2];
var masterHost = process.argv[3];
var masterPort = process.argv[4];

fs.readFile('config.json', function(err, rawConfig) {
  if(err !== null) {
    process.stderr.write(err.toString());
    process.stdout.write('Impossible de lire le fichier de configuration\n');
    process.exit(1);
  }
  var config = JSON.parse(rawConfig);
  exec(['ssh', targetHost, config.startWorker.cmd, config.pwd, masterHost, masterPort].join(' '),
       config.startWorker.options,
       function(err, stdout, stderr) {
    if(err !== null) {
      process.stderr.write(err.toString());
      process.stderr.write(stderr);
      process.stdout.write(stdout);
      process.exit(1);
    } else {
      process.exit();
    }
  });
});

