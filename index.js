//Welcome to MeshLink. This is the main file for the MeshLink project.
//This file is responsible for creating the server and setting up the routes.
//This file also contains the main logic for the server.

//import dotenv from "dotenv";
import TCPConnection from "@liamcottle/meshcore.js/src/connection/tcp_connection.js";
import Constants from "@liamcottle/meshcore.js/src/constants.js";
import mysql from 'mysql2/promise';

//dotenv.config();


var enableFlood = process.env.FLOOD_ADVERT_ON_START;
var pref = process.env.PREFIX;
var ver = "0.2.0";
var msver = "1.4.1";
var lat = process.env.LATITUDE;
var lon = process.env.LONGITUDE;
var ip = process.env.IP;
var port = process.env.PORT;
var nodename = process.env.NODENAME + " (" + pref + "h)";
var weatherapi = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`;

console.log("                                                            ___   ___                    ");
console.log("    /|    //| |     //   / /  //   ) )  //    / / / /          / /    /|    / / //   / / ");
console.log("   //|   // | |    //____    ((        //___ / / / /          / /    //|   / / //__ / /  ");
console.log("  // |  //  | |   / ____       \\\\     / ___   / / /          / /    // |  / / //__  /    ");
console.log(" //  | //   | |  //              ) ) //    / / / /          / /    //  | / / //   \\ \\    ");
console.log("//   |//    | | //____/ / ((___ / / //    / / / /____/ / __/ /___ //   |/ / //     \\ \\   ");
console.log("Written by Luca Thompson.");
console.log("Version: " + ver);
console.log("Internal MeshCore Version: " + msver);
console.log("https://angelomesh.com/meshlink");
console.log("Weather API provided at no cost by Meterologisk Institutt (https://www.met.no)\n");
console.log("Starting meshlink server...\n");

console.log("Connecting to MeshCore device...");
console.log("IP: " + ip);
console.log("Port: " + port);
const connection = new TCPConnection(ip, port);

// wait until connected

connection.on("connected", async () => {

  // we are now connected
  console.log(`Connected to: [${connection.host}:${connection.port}]`);

  console.log("Set advert name to " + nodename);
  await connection.setAdvertName(nodename);

  console.log("Set advert lat/lon to " + lat + ", " + lon);
  await connection.setAdvertLatLong(lat * 1000000, lon * 1000000); //Null Island Protection Program

  if (enableFlood == true) {
    console.log("Sending flood advert...\n");
    await connection.sendFloodAdvert();
  }
  else {
    console.log("Flood advert on boot disabled. Sending zero hop advert...\n");
    await connection.sendZeroHopAdvert();
  }

  setInterval(async () => { //check database for objects that require a node alert
    await fetchTimers();
  }, 5000);

});

async function createDatabaseConnection() {
  return await mysql.createConnection({
    host: process.env.MYSQL_SERVER,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
}

// listen for new messages
connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
    for (const message of waitingMessages) {
      if (message.contactMessage) {
        await onContactMessageReceived(message.contactMessage);
      } else if (message.channelMessage) {
        await onChannelMessageReceived(message.channelMessage);
      }
    }
  } catch (e) {
    console.log(e);
  }
});

async function fetchTimers() {
  const con = await createDatabaseConnection();
  try {
    var query = "CREATE TABLE IF NOT EXISTS Timers (TIMER_NAME VARCHAR(255), CONTACT_PUBLIC_KEY_PREF VARCHAR(255), TRIGGER_TIME BIGINT);";
    await con.query(query);
    const results = await con.query(
      'SELECT * FROM Timers;'
    );
    con.end();
    results.forEach(async result => {
      if (result[0]) {
        result.forEach(async row => {
          var currentTime = Math.round(Date.now() / 1000); //current time in seconds
          if (currentTime >= row.TRIGGER_TIME) {
            console.log("Timer found, alerting node.")
            var pubpref = new Uint8Array(row.CONTACT_PUBLIC_KEY_PREF.split(',').map(Number));
            const contact = await connection.findContactByPublicKeyPrefix(pubpref);
            if (!contact) {
              console.log("Did not find contact for received message");
              return;
            }
            //send message
            console.log("Sending message to " + pubpref);
            try {
              await connection.sendTextMessage(contact.publicKey, "Timer " + row.TIMER_NAME + " has gone off.", Constants.TxtTypes.Plain);
            } catch (e) {
              console.log(e);
            }
            var query = `DELETE FROM Timers WHERE CONTACT_PUBLIC_KEY_PREF=\'${row.CONTACT_PUBLIC_KEY_PREF}\' AND TIMER_NAME=\'${row.TIMER_NAME}\' AND TRIGGER_TIME=${row.TRIGGER_TIME};`;
            const con = await createDatabaseConnection();
            await con.query(query)
            con.end();
          }
        });
      }
    });

  } catch (e) {
    console.log(e);
  }
}

async function onContactMessageReceived(message) {
  console.log("Received contact message.\nSender Public Key Prefix: " + message.pubKeyPrefix + "\nMessage: " + message.text + "\n");

  // find first contact matching pub key prefix
  const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
  if (!contact) {
    console.log("Did not find contact for received message");
    return;
  }

  async function sendMessage(msg) {
    console.log("Sending message: " + msg + "\n" + "to: " + contact.publicKey);
    await connection.sendTextMessage(contact.publicKey, msg, Constants.TxtTypes.Plain);
  }

  // send it back
  //await connection.sendTextMessage(contact.publicKey, message.text, Constants.TxtTypes.Plain);
  if (message.text.startsWith(pref)) {
    if (message.text == pref + "h" || message.text == pref + "help" || message.text == pref + "h 1" || message.text == pref + "help 1") {
      try {
        await sendMessage("Commands: \n" + pref + "(h)elp [page] - Displays this message\n" + pref + "(p)ing - Ping MeshLink\n" + pref + "(e)cho - Echoes your message\n" + pref + "(w)eather - Displays the current weather\n(1/2)");
      }
      catch (e) {
        console.log(e);
      }
    }
    else if (message.text == pref + "h 2" || message.text.substring == pref + "help 2") {
      await sendMessage("Commands: \n" + pref + "(f)orecast - Displays weather forecast\n" + pref + "(t)imer [msg] [time in seconds] - Sets a timer\n" + pref + "(a)bout - About MeshLink\n(2/2)");
    }
    else if (message.text == pref + "p" || message.text == pref + "ping") {
      var t1 = message.senderTimestamp * 1000;
      var t2 = Date.now()
      var diff = (t2 - t1) / 1000;
      await sendMessage("Pong! Your message took approximately " + diff + " seconds to reach MeshLink, given that your node's clock is accurate.");
    }
    else if (message.text.startsWith(pref + "e ") || message.text.startsWith(pref + "echo ")) {
      if (message.text.startsWith(pref + "echo ")) var msg = message.text.substring(5);
      else msg = message.text.substring(2);
      if (msg.startsWith(" ")) msg = msg.substring(1);
      await sendMessage(msg);
    }
    else if (message.text.startsWith(pref + "weather") || message.text == (pref + "w")) {
      await fetch(weatherapi, {
        method: 'GET',
        headers: {
          'User-Agent': `MeshLink/${ver}`
        }
      })
        .then(res => res.json())
        .then(async data => {
          const timeseries = data.properties.timeseries;
          if (timeseries && timeseries.length > 0) { //normally I am against vibe coding but I am pretty sure I was having a stroke
            const firstEntry = timeseries[0];
            const entries = firstEntry.data.instant.details;
            const temperature = Math.round((entries.air_temperature * 9 / 5) + 32);
            function degreesToCardinal(degrees) {
              const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
              const index = Math.round(degrees / 22.5) % 16;
              return directions[index];
            }

            const windDirection = degreesToCardinal(entries.wind_from_direction);
            await sendMessage(`Temp: ${temperature}°F\nHum: ${entries.relative_humidity}%\nWind: ${Math.round(entries.wind_speed * 2.237)}mph\nWind Dir: ${windDirection}\nPrecip (6hr): ${Math.round(firstEntry.data.next_6_hours.details.precipitation_amount / 25.4)}in\nCond: ${firstEntry.data.next_6_hours.summary.symbol_code}`);
          } else {
            await sendMessage("Weather data is currently unavailable.");
          }
        })
        .catch(async error => {
          console.error("Error fetching weather data:", error);
          await sendMessage("Failed to fetch weather data. Please try again later.");
        });
    }
    else if (message.text.startsWith(pref + "forecast") || message.text == (pref + "f")) {
      await fetch(weatherapi, {
        method: 'GET',
        headers: {
          'User-Agent': `MeshLink/${ver}`
        }
      })
        .then(res => res.json())
        .then(async data => {
          const timeseries = data.properties.timeseries;
          if (timeseries && timeseries.length > 0) {
            const sixhrs = timeseries[5];
            const twelvehrs = timeseries[11];
            const twentyfourhrs = timeseries[23];
            await sendMessage(`6hrs:\nTemp: ${Math.round((sixhrs.data.instant.details.air_temperature * 9 / 5) + 32)}\nCond: ${sixhrs.data.next_6_hours.summary.symbol_code}\n\n12hrs:\nTemp: ${Math.round((twelvehrs.data.instant.details.air_temperature * 9 / 5) + 32)}\nCond: ${twelvehrs.data.next_6_hours.summary.symbol_code}\n\n24hrs:\nTemp: ${Math.round((twentyfourhrs.data.instant.details.air_temperature * 9 / 5) + 32)}\nPrecip: ${twentyfourhrs.data.next_1_hours.details.precipitation_amount / 25.4}in\nCond: ${twentyfourhrs.data.next_6_hours.summary.symbol_code}`);
          } else {
            await sendMessage("Weather data is currently unavailable.");
          }
        })
        .catch(async (error) => {
          console.error("Error fetching weather data:", error);
          await sendMessage("Failed to fetch weather data. Please try again later.");
        });
    }
    else if (message.text == pref + "a" || message.text == pref + "about") {
      await sendMessage("MeshLink is a server that runs on top of the MeshCore platform to provide some internet connected features, as well as some other utilities.");
      await sendMessage("Version: " + ver + "\nInternal MeshCore Version: " + msver + "\nMade by Luca\nhttps://angelomesh.com/meshlink");
    }
    else if (message.text.startsWith(pref + "t ") || message.text.startsWith(pref + "timer ")) {
      // /timer [name] [time] [unit]
      var args = message.text.split(" ");
      args.splice(0, 1);
      if (args.length == 3 && typeof args[0] == "string" && typeof parseInt(args[1]) == "number" && typeof args[2] == "string") {
        await sendMessage("Timer " + args[0] + " set for " + args[1] + " " + args[2] + ".");

        var currentTime = Math.floor(Date.now() / 1000); // current unix epoch time in seconds
        console.log(currentTime);
        var triggerTime; //epoch time in seconds when the timer should go off.

        if (args[2] == "s" || args[2] == "seconds") {
          triggerTime = currentTime + parseInt(args[1]);
        }
        else if (args[2] == "m" || args[2] == "minutes") {
          triggerTime = currentTime + (parseInt(args[1]) * 60);
        }
        else if (args[2] == "h" || args[2] == "hours") {
          triggerTime = currentTime + (parseInt(args[1]) * 3600);
        }
        else {
          await sendMessage("Invalid unit. Valid units are (s)econds, (m)inutes, and (h)ours.");
          return;
        }

        console.log(args);
        console.log("Attempting to connect to database...");

        const con = await createDatabaseConnection();
        console.log("Connected to database.");

        //time name, contact public key, trigger time
        var query = "CREATE TABLE IF NOT EXISTS Timers (TIMER_NAME VARCHAR(255), CONTACT_PUBLIC_KEY_PREF VARCHAR(255), TRIGGER_TIME BIGINT);";

        try {
          await con.query(query)// fields contains extra meta data about results, if available
        } catch (err) {
          console.log(err);
        }
        query = `INSERT INTO Timers VALUES (\'${args[0]}\', \'${message.pubKeyPrefix}\', ${triggerTime})`;
        try {
          await con.query(query)// fields contains extra meta data about results, if available
        } catch (err) {
          console.log(err);
        }

        const [results, fields] = await con.query(
          'SELECT * FROM Timers;'
        );

        console.log(results); // results contains rows returned by server
        console.log(fields);

        con.end();
        console.log("Ended database connection.");

        fetchTimers();

      }
      else {
        await sendMessage("Invalid syntax. " + pref + "timer [name] [time] [unit] (Valid units are (s)econds, (m)inutes, and (h)ours");
      }
    }
    else {
      await sendMessage("Command not found. Use " + pref + "help for a list of commands.");
    }
  }
  else {
    await sendMessage("Use " + pref + "help for a list of commands.");
  }

}

async function onChannelMessageReceived(message) {
  console.log(`Received channel message`, message);
  //DO NOT SEND IT BACK LOL
}

// todo auto reconnect on disconnect
connection.onDisconnected(async () => {
  console.log("Disconnected, reconnecting...");
  await connection.connect();
});

// connect to meshcore device
await connection.connect();