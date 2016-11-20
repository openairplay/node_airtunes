var dgram = require('dgram'),
    events = require('events'),
    util = require('util'),
    config = require('./config.js'),
    nu = require('./num_util.js'),
    RTSP = require('./rtsp.js'),
    UdpServers = require('./udp_servers.js'),
    bindings = require('../build/Release/airtunes');
    udpServers = new UdpServers();

var RTP_HEADER_SIZE = 12;

function AirTunesDevice(host, audioOut, options) {
  events.EventEmitter.call(this);

  if(!host)
    throw new Error('host is mandatory');

  this.udpServers = udpServers;
  this.audioOut = audioOut;
  this.type = 'airtunes';
  this.host = host;
  this.port = options.port || 5000;
  this.key = this.host + ':' + this.port;
  this.rtsp = new RTSP.Client(options.volume || 50, options.password || null, audioOut);
  this.audioCallback = null;
  this.encoder = bindings.newEncoder();
}

util.inherits(AirTunesDevice, events.EventEmitter);

AirTunesDevice.prototype.start = function() {
  var self = this;
  this.audioSocket = dgram.createSocket('udp4');

  // Wait until timing and control ports are chosen. We need them in RTSP handshake.
  this.udpServers.once('ports', function(err) {
    if(err) {
      self.status = 'stopped';
      self.emit('status', 'stopped');
      self.emit('error', 'udp_ports', err.code);

      return;
    }

    self.doHandshake();
  });

  this.udpServers.bind(this.host);
};

AirTunesDevice.prototype.doHandshake = function() {
  var self = this;

  this.rtsp.on('config', function(setup) {
    self.audioLatency = setup.audioLatency;
    self.requireEncryption = setup.requireEncryption;
    self.serverPort = setup.server_port;
    self.controlPort = setup.control_port;
    self.timingPort = setup.timing_port;
  });

  this.rtsp.on('ready', function() {
    self.relayAudio();
  });

  this.rtsp.on('end', function(err) {
    self.cleanup();

    if(err !== 'stopped')
      self.emit(err);
  });

  this.rtsp.startHandshake(this.udpServers, this.host, this.port);
};

AirTunesDevice.prototype.relayAudio = function() {
  var self = this;
  this.status = 'ready';
  this.emit('status', 'ready');

  this.audioCallback = function(packet) {
    var airTunes = makeAirTunesPacket(packet, self.encoder, self.requireEncryption);
    self.audioSocket.send(
      airTunes, 0, airTunes.length,
      self.serverPort, self.host
    );
  };

  this.audioOut.on('packet', this.audioCallback);
};

AirTunesDevice.prototype.onSyncNeeded = function(seq) {
  this.udpServers.sendControlSync(seq, this);
};

AirTunesDevice.prototype.cleanup = function() {
  this.audioSocket = null;
  this.status = 'stopped';
  this.emit('status', 'stopped');

  if(this.audioCallback) {
    this.audioOut.removeListener('packet', this.audioCallback);
    this.audioCallback = null;
  }

  this.udpServers.close();
  this.removeAllListeners();
};

AirTunesDevice.prototype.reportStatus = function(){
   this.emit('status', this.status);
};

AirTunesDevice.prototype.stop = function(cb) {
  this.rtsp.once('end', function() {
    if(cb)
      cb();
  });

  this.rtsp.teardown();
};

AirTunesDevice.prototype.setVolume = function(volume, callback) {
  this.rtsp.setVolume(volume, callback);
};

AirTunesDevice.prototype.setTrackInfo = function(name, artist, album, callback) {
  this.rtsp.setTrackInfo(name, artist, album, callback);
};

AirTunesDevice.prototype.setArtwork = function(art, contentType, callback) {
  this.rtsp.setArtwork(art, contentType, callback);
};

AirTunesDevice.prototype.requireEncryption = function() {
  return this.requireEncryption;
};

module.exports = AirTunesDevice;

function makeAirTunesPacket(packet, encoder, requireEncryption) {
  var alac = pcmToALAC(encoder, packet.pcm),
      airTunes = new Buffer(alac.length + RTP_HEADER_SIZE);
      header = makeRTPHeader(packet);

  if(requireEncryption)
    bindings.encryptAES(alac, alac.length);

  header.copy(airTunes);
  alac.copy(airTunes, RTP_HEADER_SIZE);

  return airTunes;
}

function pcmToALAC(encoder, pcmData) {
  var alacData = new Buffer(config.packet_size + 8);
  var alacSize = bindings.encodeALAC(encoder, pcmData, alacData, pcmData.length);

  return alacData.slice(0, alacSize);
}

function makeRTPHeader(packet) {
  var header = new Buffer(RTP_HEADER_SIZE);

  if(packet.seq === 0)
    header.writeUInt16BE(0x80e0, 0);
  else
    header.writeUInt16BE(0x8060, 0);

  header.writeUInt16BE(nu.low16(packet.seq), 2);

  header.writeUInt32BE(packet.timestamp, 4);
  header.writeUInt32BE(config.device_magic, 8);

  return header;
}
