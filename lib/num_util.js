var crypto = require('crypto');

exports.randomHex = function(n) {
  return crypto.randomBytes(n).toString('hex');
}

exports.randomBase64 = function(n) {
  return crypto.randomBytes(n).toString('base64').replace("=", "");
}

exports.randomInt = function(n) {
  return Math.floor(Math.random()*Math.pow(10, n));
}

exports.low16 = function(i) {
  return i % 65536;
}

exports.low32 = function(i) {
  return i % 4294967296;
}
