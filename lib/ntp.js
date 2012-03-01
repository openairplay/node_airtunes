var config = require('./config.js');

function NTP() {
  this.timeRef = new Date().getTime() - config.ntp_epoch*1000;
}

NTP.prototype.timestamp = function() {
  var time = new Date().getTime() - this.timeRef;
  var sec = Math.floor(time/1000);

  var msec = time - sec*1000;
  var ntp_msec = Math.floor(msec*4294967.296);

  var ts = new Buffer(8);

  ts.writeUInt32BE(sec, 0);
  ts.writeUInt32BE(ntp_msec, 4);

  return ts;
}

module.exports = new NTP();
