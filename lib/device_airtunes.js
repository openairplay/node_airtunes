var dgram = require('dgram'),
    events = require('events'),
    util = require('util'),
    RTSP = require('./rtsp.js'),
    udpServers = require('./udp_servers.js'),
    audioOut = require('./audio_out.js');

function AirTunesDevice(options) {
  events.EventEmitter.call(this);

  if(!options.host)
    throw new Error('host is mandatory');

  this.type = 'airtunes';
  this.key = options.host + ':' + options.port;
  this.host = options.host;
  this.port = options.port || 5000;
  this.rtsp = new RTSP.Client(options.volume || 50, options.password || null);
  this.audioCallback = null;

  this.status = null;
  this.statusDescription = null;
};

util.inherits(AirTunesDevice, events.EventEmitter);

AirTunesDevice.prototype.start = function() {
  var self = this;
  this.audioSocket = dgram.createSocket('udp4');

  // Wait until timing and control ports are chosen. We need them in RTSP handshake.
  udpServers.once('ports', function(err) {
    if(err) {
      self.reportStatus('error', 'udp_ports ' + err.code);
      return;
    }

    self.doHandshake();
  });

  udpServers.bind();
};

AirTunesDevice.prototype.doHandshake = function() {
  var self = this;

  this.rtsp.on('remote_ports', function(setup) {
    self.audioLatency = setup.audioLatency;
    self.serverPort = setup.server_port;
    self.controlPort = setup.control_port;
    self.timingPort = setup.timing_port;
  });

  this.rtsp.on('ready', function(err, msg) {
    if(err) {
      self.reportStatus(err, msg);
      return;
    }

    self.relayAudio();
  });

  this.rtsp.on('end', function(type) {
    if(type === 'stopped')
      self.cleanup('stopped');
    else
      self.cleanup('error', type);
  });

  this.rtsp.startHandshake(this.host, this.port);
};

AirTunesDevice.prototype.relayAudio = function() {
  var self = this;
  this.reportStatus('playing');

  this.audioCallback = function(packet) {
    packet.retain();
    self.audioSocket.send(
      packet.airTunes, 0, packet.airTunes.length,
      self.serverPort, self.host,
      function() { packet.release(); }
    );
  };

  audioOut.on('packet', this.audioCallback);
};

AirTunesDevice.prototype.onSyncNeeded = function(seq) {
  udpServers.sendControlSync(seq, this);
};

AirTunesDevice.prototype.cleanup = function(status, desc) {
  this.audioSocket = null;
  this.reportStatus(status, desc);

  if(this.audioCallback) {
    audioOut.removeListener('packet', this.audioCallback);
    this.audioCallback = null;
  }

  this.removeAllListeners();
};

AirTunesDevice.prototype.stop = function(cb) {
  this.rtsp.once('teardown', function() {
    if(cb)
      cb();
  });

  this.rtsp.teardown();
};

AirTunesDevice.prototype.reportStatus = function(status, description) {
  if(typeof status === 'string') {
    this.status = status;
    this.statusDescription = description;
  }

  if(typeof this.status === 'string')
    this.emit('status', this.status, this.description);
};

AirTunesDevice.prototype.setVolume = function(volume) {
  this.rtsp.setVolume(volume);
};

module.exports = AirTunesDevice;
