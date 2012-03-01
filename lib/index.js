var Stream = require('stream'),
    util = require('util'),
    AirTunesDevice = require('./device_airtunes.js');
    devices = require('./devices.js'),
    circularBuffer = require('./circular_buffer.js'),
    audioOut = require('./audio_out.js'),
    udpServers = require('./udp_servers.js');

function AirTunes() {
  var self = this;

  Stream.call(this);

  devices.init();
  devices.on('status', function(key, status, desc) {
    self.emit('device', key, status, desc);
  });

  circularBuffer.on('status', function(status) {
    self.emit('buffer', status);
  });

  audioOut.init(devices);
  udpServers.init(devices);

  circularBuffer.on('drain', function() {
    self.emit('drain');
  });

  circularBuffer.on('error', function(err) {
    self.emit('error', err);
  });

  this.writable = true;
}

util.inherits(AirTunes, Stream);

AirTunes.prototype.add = function(options) {
  var device = new AirTunesDevice(options);

  return devices.add(device);
};

AirTunes.prototype.stop = function(deviceKey, cb) {
  return devices.stop(deviceKey, cb);
};

AirTunes.prototype.stopAll = function(cb) {
  devices.stopAll(cb);
};

AirTunes.prototype.setVolume = function(deviceKey, volume) {
  devices.setVolume(deviceKey, volume);
};

AirTunes.prototype.write = function(data) {
  return circularBuffer.write(data);
};

AirTunes.prototype.end = function() {
  circularBuffer.end();
};

module.exports = new AirTunes();
