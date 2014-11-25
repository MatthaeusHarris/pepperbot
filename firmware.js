reset();

var pumpTimeout;
var g;
var screenBuffer = [ 
	'Initializing...',
	'Temp:   ',
	'Hum:    ',
	'Soil 1: ',
	'Soil 2: ',
	'Soil 3: ',
	'Soil 4: '
];
var brightnessMap = [0].concat([5,4.5,4,3.5,3,2.5,2,1.5,1,.5,0]
	.map(function(i) { 
		return 1 / Math.pow(2,i);
	}));
var lineHeight = 7;
var dht;
var brightness = 1;
var tempInterval, soilInterval. throbInterval;
var config;

var startThrobber = function() {
	var i = 0;
	var ledMap = [
		[0,0,0,1,1,1],
		[0,0,1,1,1,0],
		[0,1,1,1,0,0]
	];
	throbInterval = setInterval(function() {
		digitalWrite(LED1, ledMap[0][i%6]);
		digitalWrite(LED2, ledMap[1][i%6]);
		digitalWrite(LED3, ledMap[2][i%6]);
		i += 1;
	}, 100);
}

var onPage = function (req, res) {
  var rurl = url.parse(req.url,true);
  if (rurl.pathname=="/sense") {
  	readTemperature(function(temp, rh) {
	  	readMoisture(function(moisture) {
	  		res.writeHead(200, {'Content-Type': 'application/json'});
	  		res.end(JSON.stringify({
	  			moisture: moisture,
	  			temp: temp,
	  			rh: rh
	  		}));
  			screenBuffer[1] = "Temp:   " + temp;
			screenBuffer[2] = "Hum:    " + rh + "%";
			screenBuffer[3] = "Soil 1: " + moisture[0];
			screenBuffer[4] = "Soil 2: " + moisture[1];
			screenBuffer[5] = "Soil 3: " + moisture[2];
			screenBuffer[6] = "Soil 4: " + moisture[3];
			refreshDisplay();
	  	});	
	  });
  	
  } else {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end("Not Found.");
  }
}

var readMoisture = function(callback) {
	digitalWrite(pinMap[config.sensors.soil.enable], 1);
	setTimeout(function() {
		var readings = [];
		for (var readPin in config.sensors.soil.read) {
			readings[readPin] = Math.round(analogRead(pinMap[config.sensors.soil.read[readPin]]) * 100) / 100;
		}
		callback(readings);
		setTimeout(function() {
			digitalWrite(pinMap[config.sensors.soil.enable], 0);
		}, 500)
	}, 1000);
}

var readTemperature = function(callback) {
	dht.read(function(a) {
		callback((a.temp * (9/5)) + 32, a.rh);
	});
}

var pumpStart = function() {
	digitalWrite(pinMap[config.relays.pump],0);
	pumpTimeout = setTimeout(function() {
		pumpTimeout = null;
		pumpStop();
	}, 1000);
}

var pumpStop = function() {
	digitalWrite(pinMap[config.relays.pump],1);
	if (pumpTimeout) {
		clearTimeout(pumpTimeout);
	}
}

var startHeartbeat = function() {
	interval = setInterval(function() {
		digitalWrite(LED3, 1);
		setTimeout(function() {
			digitalWrite(LED3, 0);
		}, 250);
	}, 5000);

	tempInterval = setInterval(function() {
		buttonPressed({pin: pinMap[config.buttons.temp]});
	}, 5000);

	soilInterval = setInterval(function() {
		buttonPressed({pin: pinMap[config.buttons.soil]});
	}, 60000);
}

var buttonPressed = function(e) {
	switch(e.pin) {
		case pinMap[config.buttons.temp]:
			readTemperature(function(temp, hum) {
				screenBuffer[1] = "Temp:   " + temp;
				screenBuffer[2] = "Hum:    " + hum + "%";
				refreshDisplay();
			});
			break;
		case pinMap[config.buttons.soil]:
			readMoisture(function(moisture) {
				screenBuffer[3] = "Soil 1: " + moisture[0];
				screenBuffer[4] = "Soil 2: " + moisture[1];
				screenBuffer[5] = "Soil 3: " + moisture[2];
				screenBuffer[6] = "Soil 4: " + moisture[3];
				refreshDisplay();
			});
			break;
		case pinMap[config.buttons.bright]:
			brightness += 1;
			brightness = Math.min(brightness, brightnessMap.length-1);
			analogWrite(A3, brightnessMap[brightness], { freq: 120 });
			break;
		case pinMap[config.buttons.dim]:
			brightness -= 1;
			brightness = Math.max(brightness, 0);
			analogWrite(A3, brightnessMap[brightness], { freq: 120 });
			break;
	}
}

var refreshDisplay = function() {
	g.clear();
	for (var line in screenBuffer) {
		g.drawString(screenBuffer[line], 0, line * lineHeight);
	}
	g.flip();
}

var readConfig = function() {
	config = JSON.parse(fs.readFileSync('/config.json'));
}

var writeConfig = function() {
	fs.writeFileSync('/config.json', JSON.stringify(config));
}

var start = function() {
	clearInterval(throbInterval);
	config = JSON.parse(fs.readFileSync('/config.json'));
	digitalWrite(LED3,1);
	digitalWrite(LED2,1);
	digitalWrite(LED1,1);
	digitalWrite(pinMap[config.relays.pump], 1);

	var a = 1;
	var interval;
	clearInterval();
	readMoisture(function() {});
	var pumpTimeout;

	SPI1.setup({ baud: 1000000, sck: A5, mosi:A7 });
	g = require("PCD8544").connect(SPI1, A6, B0, B1, function() {
		analogWrite(A3, brightnessMap[brightness], { freq: 120 });
		g.setContrast(0.45);
		refreshDisplay();

		var wlan = require("CC3000").connect();
		digitalWrite(LED1,0);
		screenBuffer[0] = "CC3000 initialized";
		refreshDisplay();

		wlan.connect( config.wireless.ssid, config.wireless.key, function (s) {
			console.log(s); 
			if (s == "connect") {
				digitalWrite(LED2,0);
				screenBuffer[0] = "WiFi connected";
				refreshDisplay();
			}
			if (s == "dhcp") {
				console.log(wlan.getIP());

				screenBuffer[0] = "IP " + wlan.getIP().ip;
				refreshDisplay();

				require("http").createServer(onPage).listen(80);
				digitalWrite(LED3,0);
				startHeartbeat();
			}
		});
	});

	dht = require("DHT11").connect(pinMap[config.sensors.temp.read]);
	setWatch(pumpStart, BTN1, {edge: "rising", repeat: true, debounce: 1});

	setWatch(pumpStop, BTN1, {edge: "falling", repeat: true, debounce: 1});

	setWatch(buttonPressed, pinMap[config.buttons.temp], {edge: "rising", repeat: true});
	setWatch(buttonPressed, pinMap[config.buttons.soil], {edge: "rising", repeat: true});
	setWatch(buttonPressed, pinMap[config.buttons.bright], {edge: "rising", repeat: true});
	setWatch(buttonPressed, pinMap[config.buttons.dim], {edge: "rising", repeat: true});
}

onInit = function() {
	startThrobber();
	setTimeout(function() {
		start();
	}, 2000);
}

save();

