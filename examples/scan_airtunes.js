var util = require('util'),
    os = require('os'),
    exec = require('child_process').exec;

if(os.platform() !== 'darwin') {
  console.error('Sorry, this utility only works with OS X.');
  process.exit(1);
}

// Mountain Lion 12.0.0 replaces mDNS with dns-sd
if(os.release() < '12')
  var mdns = 'mDNS';
else
  var mdns = 'dns-sd';

exec(mdns + ' -B _raop._tcp', {
  timeout: 300
}, function(error, stdout) {
  var devices = [];
  stdout.split('\n').forEach(function(line) {
    var res = /_raop\._tcp\.\s+([^@]+)@(.*)/.exec(line);
    if(!res)
      return;

    devices.push({
      mac: res[1],
      name: res[2]
    });
  });

  devices.forEach(function(dev) {
    exec(mdns + ' -L "' + dev.mac + '@' + dev.name + '" _raop._tcp local', {
      timeout: 300
    }, function(error, stdout) {
      var res = /can be reached at\s+(\S*)\s*:(\d+)/.exec(stdout);
      if(!res)
        console.log(dev.name + ' no match');
      else
        console.log(dev.name + ' ' + res[1] + ':' + res[2]);
    });
  });
});
