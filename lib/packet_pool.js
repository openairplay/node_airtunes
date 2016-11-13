var config = require('./config.js');

function PacketPool() {
  this.pool = [];
}

PacketPool.prototype.getPacket = function() {
  var packet = this.pool.shift();

  if(!packet) {
    packet = new Packet(this);
  } else
    packet.retain();

  return packet;
};

PacketPool.prototype.release = function(packet) {
  this.pool.push(packet);
};

function Packet(pool) {
  this.pool = pool;
  this.ref = 1;
  this.seq = null;
  this.pcm = new Buffer(config.packet_size);
}

Packet.prototype.retain = function() {
  this.ref++;
};

Packet.prototype.release = function() {
  this.ref--;

  if(this.ref === 0) {
    this.seq = null;
    this.pool.release(this);
  }
};

module.exports = PacketPool;
