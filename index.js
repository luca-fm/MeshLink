//Welcome to MeshLink. This is the main file for the MeshLink project.
//This file is responsible for creating the server and setting up the routes.
//This file also contains the main logic for the server.

import TCPConnection from "@liamcottle/meshcore.js/src/connection/tcp_connection.js";
import Constants from "@liamcottle/meshcore.js/src/constants.js";

var enableFlood = process.env.FLOOD_ADVERT_ON_START;
var pref = process.env.PREFIX; 
var ver = "0.1.0";
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
console.log("Starting meshlink server...\n");

console.log("Connecting to MeshCore device...");
const connection = new TCPConnection(ip, port);

// wait until connected
connection.on("connected", async () => {

  // we are now connected
  console.log(`Connected to: [${connection.host}:${connection.port}]`);

  console.log("Set advert name to " + nodename);
  await connection.setAdvertName(nodename);

  console.log("Set advert lat/lon to " + lat + ", " + lon);
  await connection.setAdvertLatLong(lat * 1000000, lon * 1000000); //Null Island Protection Program

  if(enableFlood == true)
  {
    console.log("Sending flood advert...\n");
    await connection.sendFloodAdvert();
  }
  else 
  {
    console.log("Flood advert on boot disabled. Sending zero hop advert...\n");
    await connection.sendZeroHopAdvert();
  }

});

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


async function onContactMessageReceived(message) {
  console.log("Received contact message.\nSender Public Key Prefix: " + message.pubKeyPrefix + "\nMessage: " + message.text + "\n");

  // find first contact matching pub key prefix
  const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
  if (!contact) {
    console.log("Did not find contact for received message");
    return;
  }
  /*else {
    connection.addOrUpdateContact(contact); this is not working yet
  }*/

  async function sendMessage(msg) {
    console.log("Sending message: " + msg + "\n");
    await connection.sendTextMessage(contact.publicKey, msg, Constants.TxtTypes.Plain);
  }

  // send it back
  //await connection.sendTextMessage(contact.publicKey, message.text, Constants.TxtTypes.Plain);
  if (message.text.startsWith(pref)) {
    if (message.text == pref + "h" || message.text == pref + "help") {
      try
      {
        await sendMessage("Commands: \n" + pref + "(h)elp - Displays this message\n" + pref + "(p)ing - Ping MeshLink\n" + pref + "(e)cho - Echoes your message\n" + pref + "(w)eather - Displays the current weather\n(1/2)");
        await sendMessage("Commands: \n" + pref + "(f)orecast - Displays weather forecast\n" + pref + "(a)bout - About MeshLink\n(2/2)");
      }
      catch(e)
      {
        console.log(e);
      }
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
