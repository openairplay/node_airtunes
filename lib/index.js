var Stream = require('stream'),
    util = require('util'),
    devices = require('./devices.js'),
    config = require('./config.js'),
    CircularBuffer = require('./circular_buffer.js'),
    audioOut = require('./audio_out.js');

function AirTunes() {
  var self = this;

  Stream.call(this);

  devices.init();
  devices.on('status', function(key, status, desc) {
    self.emit('device', key, status, desc);
  });

  this.circularBuffer = new CircularBuffer(config.packets_in_buffer, config.packet_size);

  this.circularBuffer.on('status', function(status) {
    self.emit('buffer', status);
  });

  audioOut.init(devices, this.circularBuffer);

  this.circularBuffer.on('drain', function() {
    self.emit('drain');
  });

  this.circularBuffer.on('error', function(err) {
    self.emit('error', err);
  });

  this.writable = true;
}

util.inherits(AirTunes, Stream);

AirTunes.prototype.add = function(host, options) {
  return devices.add('airtunes', host, options);
};

AirTunes.prototype.addCoreAudio = function(options) {
  return devices.add('coreaudio', null, options);
};

AirTunes.prototype.stopAll = function(cb) {
  devices.stopAll(cb);
};

AirTunes.prototype.setVolume = function(deviceKey, volume, callback) {
  devices.setVolume(deviceKey, volume, callback);
};

AirTunes.prototype.setTrackInfo = function(deviceKey, name, artist, album, callback) {
  devices.setTrackInfo(deviceKey, name, artist, album, callback);
};

AirTunes.prototype.reset = function() {
	this.circularBuffer.reset();
};

AirTunes.prototype.setArtwork = function(deviceKey, art, contentType, callback) {
  devices.setArtwork(deviceKey, art, contentType, callback);
};

AirTunes.prototype.write = function(data) {
  return this.circularBuffer.write(data);
};

AirTunes.prototype.end = function() {
  this.circularBuffer.end();
};

module.exports = new AirTunes();
module.exports.AirTunes = AirTunes;