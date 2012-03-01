var airtunes = require('../lib/'),
    argv = require('optimist')
      .usage('Usage: $0 --host [host] --port [num] --volume [num] --password [string]')
      .default('port', 5000)
      .default('volume', 50)
      .demand(['host'])
      .argv;

console.log('pipe PCM data to play over AirTunes');
console.log('example: cat ./sample.pcm | node play_stdin.js --host <AirTunes host>\n');

console.log('adding device: ' + argv.host + ':' + argv.port);
airtunes.add(argv);

// when the device is online, spawn ffmpeg to transcode the file
airtunes.on('device', function(key, status, desc) {
  console.log('device ' + key + ' status: ' + status + (desc ? ' ' + desc : ''));

  if(status !== 'playing')
    process.exit(1);

  process.stdin.pipe(airtunes);
  process.stdin.resume();
});

// monitor buffer events
airtunes.on('buffer', function(status) {
  console.log('buffer ' + status);

  // after the playback ends, give some time to AirTunes devices
  if(status === 'end') {
    console.log('playback ended, waiting for AirTunes devices');
    setTimeout(function() {
      airtunes.stopAll(function() {
        console.log('end');
        process.exit();
      });
    }, 2000);
  }
});
