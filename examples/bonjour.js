/**
*	Crude Bonjour discovery service	implementation
*	Allow detection of airplay devices
*
*	Usage :

var airports = [];

var bonjour = new Bonjour();
bonjour.on('error', function(err){console.log(err)});
bonjour.on('data', function(from, msg){
	var res = {name:'', ip:'', mac:''};
	var lines = msg.split("\n");
	lines.forEach(function(line, i){
		if (i==2) {
			res.name = line.trim();
			}
		if (/info@model=AirPort/.test(line)){
			var match = line.match(/waMA=([0-9A-F\-]+)/);	
			if (match && match.length > 0){
				res.mac = match[1].split('-').join(':');
				}
			res.ip = from.address;
			var found = airports.filter(function(airport){
				return airport.mac === res.mac;
				});
			if (found.length < 1) airports.push(res);	
			}
		});
	console.log(JSON.stringify(airports));	
	});	
	
bonjour.on('ready', function(){
	bonjour.seek('_airport');
	});
	
*/

var EventEmitter  = require('events').EventEmitter
,	sys		= require('sys')
,	dgram 	= require('dgram')
;

const MDNS_PORT = 5353;
const MDNS_HOST = '224.0.0.251';

var Bonjour = function(){
	
	EventEmitter.call(this);
	
	var self= this
	,	server = dgram.createSocket('udp4');
	
	server.on('error', 		function(err) {self.emit('error', err)});
	server.on('message', 	function(msg, from) {
		var res = msg.toString('ascii')
		,	len=res.length
		,	str = []
		;
		// filter bad chars
		for (var i=0; i<len; i++){
			var code = res.charCodeAt(i);
			if (code > 0x1f){
				str.push(res[i]);
				}
			else {
				if (code == 0x0c){
					str.push("\n");
				}
			}
		}
		self.emit('data', from, str.join(''));
		});
		
	server.on('listening', 	function(err){
		self.emit('ready');
		});
	server.bind(MDNS_PORT, '0.0.0.0', function(err){
		server.addMembership(MDNS_HOST);
		});
	
	self.server = server;	
	
	return this;
	}
	
sys.inherits(Bonjour, EventEmitter);

/**
* 	@param: service name string, the first part of _XXX(._tcp.local)
*/
Bonjour.prototype.seek	= function(service){
	var msg	= [0x00,0x00,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x08]
	,	end	= [0x04, 					// .
		0x5f,0x74,0x63,0x70,0x05,		// _tcp.
		0x6c,0x6f,0x63,0x61,0x6c,		//	local
		0x00,0x00,0x0c,0x00,0x01
		]
	,	len	= service.length
	;
	for (var i=0; i<len; i++){
		msg.push(service.charCodeAt(i));
		}
	msg = msg.concat(end);	
	var buf = new Buffer(msg);
	this.server.send(buf, 0, buf.length, MDNS_PORT, MDNS_HOST, function(err,msg){});
	}
module.exports = Bonjour;
