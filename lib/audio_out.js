var events = require('events'),
    util = require('util'),
    config = require('./config.js'),
    nu = require('./num_util.js'),
    circularBuffer = require('./circular_buffer.js'),
    bindings = require('../build/Release/bindings');

function AudioOut() {
  events.EventEmitter.call(this);

  this.lastSeq = -1;
  this.encoder = bindings.newEncoder();
  this.needAirTunesPacket = false;
}

util.inherits(AudioOut, events.EventEmitter);

AudioOut.prototype.init = function(devices) {
  var self = this;
  config.rtp_time_ref = new Date().getTime();

  devices.on('airtunes_devices', function(hasAirTunes) {
    // only compute AirTunes packets when we have AirTunes devices
    self.needAirTunesPacket = hasAirTunes;
  });

  devices.on('need_sync', function() {
    // a sync is forced when a new remote device is added
    self.emit('need_sync', self.lastSeq);
  });

  function sendPacket(seq) {
    // sendPacket prepares packets for all devices
    var packet = circularBuffer.readPacket();
    packet.seq = seq;

    if(self.needAirTunesPacket) {
      makeAirTunesPacket(packet, seq);

      if(seq % config.sync_period == 0)
        self.emit('need_sync', seq);
    }
  
    self.emit('packet', packet);
    packet.release();
  }

  function makeAirTunesPacket(packet, seq) {
    packet.alac = pcmToAlac(self.encoder, packet.pcm)
    var airTunesData = new Buffer(12 + packet.alac.length);

    if(seq == 0)
      airTunesData.writeUInt16BE(0x80e0, 0);
    else
      airTunesData.writeUInt16BE(0x8060, 0);

    airTunesData.writeUInt16BE(nu.low16(seq), 2);

    var timestamp = nu.low32(seq*config.frames_per_packet + 2*config.sampling_rate);
    airTunesData.writeUInt32BE(timestamp, 4);
    airTunesData.writeUInt32BE(config.device_magic, 8);

    packet.alac.copy(airTunesData, 12);
    packet.airTunes = airTunesData;
    packet.timestamp = timestamp;
  }

  function syncAudio() {
    /*
     * Each time syncAudio() runs, a burst of packet is sent.
     * Increasing config.stream_latency lowers CPU usage but increases the size of the burst.
     * If the burst size exceeds the UDP windows size (which we do not know), packets are lost.
     */
    var elapsed = new Date().getTime() - config.rtp_time_ref;

    /*
     * currentSeq is the # of the packet we should be sending now. We have some packets to catch-up
     * since syncAudio is not always running.
     */
    var currentSeq = Math.floor(elapsed*config.sampling_rate/(config.frames_per_packet*1000));

    for(var i = self.lastSeq + 1; i <= currentSeq; i++)
      sendPacket(i);

    self.lastSeq = currentSeq;

    // reschedule ourselves later
    setTimeout(syncAudio, config.stream_latency);
  }

  syncAudio();
}

function pcmToAlac(encoder, pcmData) {
  var alacData = new Buffer(config.packet_size + 8);
  var alacSize = bindings.encodePacket(encoder, pcmData, alacData, pcmData.length);

  return alacData.slice(0, alacSize);
}

module.exports = new AudioOut();
