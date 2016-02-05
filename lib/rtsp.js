var net = require('net'),
    crypto = require('crypto'),
    events = require('events'),
    util = require('util'),
    fs = require('fs'),
    config = require('./config.js'),
    audioOut = require('./audio_out.js'),
    nu = require('./num_util.js');

var OPTIONS = 0,
    ANNOUNCE = 1,
    SETUP = 2,
    RECORD = 3,
    SETVOLUME = 4,
    PLAYING = 5,
    TEARDOWN = 6,
    CLOSED = 7,
    SETDAAP = 8,
    SETART = 9;

function Client(volume, password) {
  events.EventEmitter.call(this);

  this.status = OPTIONS;
  this.socket = null;
  this.cseq = 0;
  this.announceId = null;
  this.activeRemote = nu.randomInt(9);
  this.dacpId = nu.randomHex(8);
  this.session = null;
  this.timeout = null;
  this.volume = volume;
  this.password = password;
  this.passwordTried = false;
  this.requireEncryption = false;
  this.trackInfo = null;
  this.artwork = null;
  this.artworkContentType = null;
  this.callback = null;
  this.controlPort = null;
  this.timingPort  = null;
}

util.inherits(Client, events.EventEmitter);

exports.Client = Client;

Client.prototype.startHandshake = function(udpServers, host, port) {
  var self = this;

  this.startTimeout();

  this.controlPort = udpServers.control.port;
  this.timingPort  = udpServers.timing.port;


  this.socket = net.connect(port, host, function() {
    self.clearTimeout();
    self.sendNextRequest();
  });

  var blob = '';
  this.socket.on('data', function(data) {
    self.clearTimeout();

    /*
     * I wish I could use node's HTTP parser for this...
     * I assume that all responses have empty bodies.
     */
    data = data.toString();

    blob += data;
    var endIndex = blob.indexOf('\r\n\r\n');

    if (endIndex < 0) {
      return;
    }

    endIndex += 4;

    blob = blob.substring(0, endIndex);

    self.processData(blob);

    blob = data.substring(endIndex);
  });

  this.socket.on('error', function(err) {
    self.socket = null;

    if(err.code === 'ECONNREFUSED')
      self.cleanup('connection_refused');
    else
      self.cleanup('rtsp_socket', err.code);
  });

  this.socket.on('end', function() {
    self.cleanup('disconnected');
  });
};

Client.prototype.startTimeout = function() {
  var self = this;

  this.timeout = setTimeout(function() {
    self.cleanup('timeout');
  }, config.rtsp_timeout);
};

Client.prototype.clearTimeout = function() {
  if(this.timeout !== null) {
    clearTimeout(this.timeout);
    this.timeout = null;
  }
};

Client.prototype.teardown = function() {
  if(this.status === CLOSED) {
    this.emit('end', 'stopped');
    return;
  }

  this.status = TEARDOWN;
  this.sendNextRequest();
};

Client.prototype.setVolume = function(volume, callback) {
  if(this.status !== PLAYING)
    return;

  this.volume = volume;
  this.callback = callback;
  this.status = SETVOLUME;
  this.sendNextRequest();
};

Client.prototype.setTrackInfo = function(name, artist, album, callback) {
  if(this.status !== PLAYING)
    return;

  this.trackInfo = {
    name: name,
    artist: artist,
    album: album
  };
  this.status = SETDAAP;
  this.callback = callback;
  this.sendNextRequest();
};

Client.prototype.setArtwork = function(art, contentType, callback) {
  if(this.status !== PLAYING)
    return;

  if (typeof contentType == 'function') {
    callback = contentType;
    contentType = null;
  }

  if (typeof art == 'string') {
    var self = this;
    if (contentType === null) {
      var ext = art.slice(-4);
      if (ext == ".jpg" || ext == "jpeg") {
        contentType = "image/jpeg";
      } else if (ext == ".png") {
        contentType = "image/png";
      } else if (ext == ".gif") {
        contentType = "image/gif";
      } else {
        return self.cleanup('unknown_art_file_ext');
      }
    }
    return fs.readFile(art, function(err, data) {
      if (err !== null) {
        return self.cleanup('invalid_art_file');
      }
      self.setArtwork(data, contentType, callback);
    });
  }

  if (contentType === null)
    return this.cleanup('no_art_content_type');

  this.artworkContentType = contentType;
  this.artwork = art;
  this.status = SETART;
  this.callback = callback;
  this.sendNextRequest();
};

Client.prototype.nextCSeq = function() {
  this.cseq += 1;

  return this.cseq;
};

Client.prototype.cleanup = function(type, msg) {
  this.emit('end', type, msg);
  this.status = CLOSED;
  this.trackInfo = null;
  this.artwork = null;
  this.artworkContentType = null;
  this.callback = null;
  this.removeAllListeners();

  if(this.timeout) {
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  if(this.socket) {
    this.socket.destroy();
    this.socket = null;
  }
};

function parseResponse(blob) {
  var response = {}, lines = blob.split('\r\n');

  var codeRes = /(\w+)\/(\S+) (\d+) (.*)/.exec(lines[0]);
  if(!codeRes) {
    response.code = 599;
    response.status = 'UNEXPECTED ' + lines[0];

    return response;
  }

  response.code = parseInt(codeRes[3], 10);
  response.status = codeRes[4];

  var headers = {};
  lines.slice(1).forEach(function(line) {
    var res = /([^:]+):\s*(.*)/.exec(line);

    if(!res)
      return;

    headers[res[1]] = res[2];
  });

  response.headers = headers;

  return response;
}

function md5(str) {
  var md5sum = crypto.createHash('md5');
  md5sum.update(str);

  return md5sum.digest('hex').toUpperCase();
}

Client.prototype.makeHead = function(method, uri, di) {
  var head = method + ' ' + uri + ' RTSP/1.0\r\n' +
    'CSeq: ' + this.nextCSeq() + '\r\n' +
    'User-Agent: ' + config.user_agent + '\r\n' +
    'DACP-ID: ' + this.dacpId + '\r\n' +
    'Client-Instance: ' + this.dacpId + '\r\n' +
    (this.session ? 'Session: ' + this.session + '\r\n' : '') +
    'Active-Remote: ' + this.activeRemote + '\r\n';

  if(di) {
    var ha1 = md5(di.username + ':' + di.realm + ':' + di.password);
    var ha2 = md5(method + ':' + uri);
    var diResponse = md5(ha1 + ':' + di.nonce + ':' + ha2);

    head += 'Authorization: Digest ' +
      'username="' + di.username + '", ' +
      'realm="' + di.realm + '", ' +
      'nonce="' + di.nonce + '", ' +
      'uri="' + uri + '", ' +
      'response="' + diResponse + '"\r\n';
  }

  return head;
}

Client.prototype.makeHeadWithURL = function(method, digestInfo) {
  return this.makeHead(method, 'rtsp://' + this.socket.address().address + '/' + this.announceId, digestInfo);
}

Client.prototype.makeRtpInfo = function() {
  var nextSeq = audioOut.lastSeq + 1;
  var rtpSyncTime = nextSeq*config.frames_per_packet + 2*config.sampling_rate;
  return 'RTP-Info: seq=' + nextSeq + ';rtptime=' + rtpSyncTime + '\r\n';
};

Client.prototype.sendNextRequest = function(di) {
  var request = '', body = '';

  switch(this.status) {
  case OPTIONS:
    request += this.makeHead('OPTIONS', '*', di);
    request += 'Apple-Challenge: SdX9kFJVxgKVMFof/Znj4Q\r\n\r\n';
    break;

  case ANNOUNCE:
    this.announceId = nu.randomInt(8);

    body =
      'v=0\r\n' +
      'o=iTunes ' + this.announceId +' 0 IN IP4 ' + this.socket.address().address + '\r\n' +
      's=iTunes\r\n' +
      'c=IN IP4 ' + this.socket.address().address + '\r\n' +
      't=0 0\r\n' +
      'm=audio 0 RTP/AVP 96\r\n' +
      'a=rtpmap:96 AppleLossless\r\n' +
      'a=fmtp:96 352 0 16 40 10 14 2 255 0 0 44100\r\n';
    if (this.requireEncryption) {
      body +=
        'a=rsaaeskey:' + config.rsa_aeskey_base64 + '\r\n' +
        'a=aesiv:' + config.iv_base64 + '\r\n';
    }

    request += this.makeHeadWithURL('ANNOUNCE', di);
    request +=
      'Content-Type: application/sdp\r\n' +
      'Content-Length: ' + body.length + '\r\n\r\n';

    request += body;
    break;

  case SETUP:
    request += this.makeHeadWithURL('SETUP', di);
    request +=
      'Transport: RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;' +
      'control_port=' + this.controlPort + ';' +
      'timing_port=' + this.timingPort + '\r\n\r\n';
    break;

  case RECORD:
    request += this.makeHeadWithURL('RECORD', di);
    request += this.makeRtpInfo() + 'Range: npt=0-\r\n\r\n';
    break;

  case SETVOLUME:
    var attenuation =
      this.volume === 0.0 ?
      -144.0 :
      (-30.0)*(100 - this.volume)/100.0;

    body = 'volume: ' + attenuation + '\r\n';

    request += this.makeHeadWithURL('SET_PARAMETER', di);
    request +=
      'Content-Type: text/parameters\r\n' +
      'Content-Length: ' + body.length + '\r\n\r\n';

    request += body;
    break;

  case SETDAAP:
    var name = this.daapEncode('minm', this.trackInfo.name);
    var artist = this.daapEncode('asar', this.trackInfo.artist);
    var album = this.daapEncode('asal', this.trackInfo.album);
    var daapInfo = this.daapEncodeList('mlit', name, artist, album);

    var head = this.makeHeadWithURL('SET_PARAMETER', di);
    head += this.makeRtpInfo();
    head +=
      'Content-Type: application/x-dmap-tagged\r\n' +
      'Content-Length: ' + daapInfo.length + '\r\n\r\n';

    var buf = new Buffer(head.length);
    buf.write(head, 0, head.length, 'ascii');
    request = Buffer.concat([buf, daapInfo]);

    break;

  case SETART:
    var head = this.makeHeadWithURL('SET_PARAMETER', di);
    head += this.makeRtpInfo();
    head +=
      'Content-Type: ' + this.artworkContentType + '\r\n' +
      'Content-Length: ' + this.artwork.length + '\r\n\r\n';

    var buf = new Buffer(head.length);
    buf.write(head, 0, head.length, 'ascii');
    request = Buffer.concat([buf, this.artwork]);

    break;

  case TEARDOWN:
    this.socket.end(this.makeHead('TEARDOWN', '', di) + '\r\n');
    this.cleanup('stopped');
    // return here since the socket is closed
    return;

  default:
    return;
  }

  this.startTimeout();
  this.socket.write(request);
};

Client.prototype.daapEncodeList = function(field) {
  var values = Array.prototype.slice.call(arguments);
  values.shift();
  var value = Buffer.concat(values);
  var buf = new Buffer(field.length + 4);
  buf.write(field, 0, field.length, 'ascii');
  buf.writeUInt32BE(value.length, field.length);
  return Buffer.concat([buf, value]);
};

Client.prototype.daapEncode = function(field, value) {
  var buf = new Buffer(field.length + value.length + 4);
  buf.write(field, 0, field.length, 'ascii');
  buf.writeUInt32BE(value.length, field.length);
  buf.write(value, field.length + 4, value.length, 'ascii');
  return buf;
};

Client.prototype.parsePorts = function(headers) {
  function parsePort(name, transport) {
    var re = new RegExp(name + '=(\\d+)');
    var res = re.exec(transport);

    return res ? parseInt(res[1]) : null;
  }

  var transport = headers['Transport'],
      rtspConfig = {
        audioLatency: parseInt(headers['Audio-Latency']),
        requireEncryption: this.requireEncryption
      },
      names = ['server_port', 'control_port', 'timing_port'];

  for(var i = 0; i < names.length; i++) {
    var name = names[i];
    var port = parsePort(name, transport);

    if(!port) {
      this.cleanup('parse_ports', transport);
      return false;
    } else
      rtspConfig[name] = port;
  }

  this.emit('config', rtspConfig);

  return true;
}

function parseAuthenticate(auth, field) {
  var re = new RegExp(field + '="([^"]+)"'),
      res = re.exec(auth);

  return res ? res[1] : null;
}

Client.prototype.processData = function(blob) {
  var response = parseResponse(blob),
      headers = response.headers;

  if(response.code === 401) {
    if(!this.password) {
      this.cleanup('no_password');
      return;
    }

    if(this.passwordTried) {
      this.cleanup('bad_password');
      return;
    } else
      this.passwordTried = true;

    var auth = headers['WWW-Authenticate'];
    var di = {
      realm: parseAuthenticate(auth, 'realm'),
      nonce: parseAuthenticate(auth, 'nonce'),
      username: 'Radioline',
      password: this.password
    };

    this.sendNextRequest(di);
    return;
  }

  if(response.code === 453) {
    this.cleanup('busy');
    return;
  }

  if(response.code !== 200) {
    this.cleanup(response.status);
    return;
  }

  // password was accepted (or not needed)
  this.passwordTried = false;

  switch(this.status) {
    case OPTIONS:
      /*
       * Devices like Apple TV and Zeppelin Air do not support encryption.
       * Only way of checking that: they do not reply to Apple-Challenge
       */
      if(headers['Apple-Response'])
        this.requireEncryption = true;

      this.status = ANNOUNCE;
      break;

    case ANNOUNCE:
      this.status = SETUP;
      break;

    case SETUP:
      this.status = RECORD;
      this.session = headers['Session'];
      this.parsePorts(headers);
      break;

    case RECORD:
      this.status = SETVOLUME;
      this.emit('ready');
      break;

    case SETVOLUME:
      this.status = PLAYING;
      break;

    case SETDAAP:
      this.status = PLAYING;
      break;

    case SETART:
      this.status = PLAYING;
      break;
  }

  if (this.callback != null) {
    this.callback();
  }

  this.sendNextRequest();
}
