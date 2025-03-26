//Welcome to MeshLink. This is the main file for the MeshLink project.
//This file is responsible for creating the server and setting up the routes.
//This file also contains the main logic for the server.

import TCPConnection from "@liamcottle/meshcore.js/src/connection/tcp_connection.js";
import Constants from "@liamcottle/meshcore.js/src/constants.js";

var pref = "/";

console.log("Starting MeshLink");
// create tcp connection
const connection = new TCPConnection("192.168.4.4", 5000);

// wait until connected
connection.on("connected", async () => {

    // we are now connected
    console.log(`Connected to: [${connection.host}:${connection.port}]`);

    // send flood advert when connected
    await connection.setAdvertName("MeshLink Alpha (" + pref + "h)");
    //await connection.sendFloodAdvert();
    connection.sendZeroHopAdvert();

});

// listen for new messages
connection.on(Constants.PushCodes.MsgWaiting, async () => {
    try {
        const waitingMessages = await connection.getWaitingMessages();
        for(const message of waitingMessages){
            if(message.contactMessage){
                await onContactMessageReceived(message.contactMessage);
            } else if(message.channelMessage) {
                await onChannelMessageReceived(message.channelMessage);
            }
        }
    } catch(e) {
        console.log(e);
    }
});


async function onContactMessageReceived(message) {

    console.log("Received contact message.\nSender Public Key Prefix: " + message.pubKeyPrefix + "\nMessage: " + message.text);

    // find first contact matching pub key prefix
    const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
    if(!contact){
        console.log("Did not find contact for received message");
        return;
    }

    async function sendMessage(msg){
      console.log("Sending message: " + msg);
      await connection.sendTextMessage(contact.publicKey, msg, Constants.TxtTypes.Plain);
    }

    // send it back
    //await connection.sendTextMessage(contact.publicKey, message.text, Constants.TxtTypes.Plain);
    if(message.text.startsWith(pref))
    {
      if(message.text == pref + "h" || message.text == pref + "help")
      {
        sendMessage("Commands: \n" + pref + "help - Displays this message\n" + pref + "ping - Ping MeshLink!\n" + pref + "echo - Echoes your message\n" + pref + "weather - Displays the current weather\n(1/2)");
        sendMessage("Commands: \n" + pref + "forecast - Displays weather forecast\n(2/2)");
      }
      if(message.text == pref + "p" || message.text == pref + "ping")
      {
        var t1 = message.senderTimestamp * 1000;
        var t2 = Date.now()
        var diff = (t2 - t1) / 1000;
        sendMessage("Pong! Your message took approximately " + diff + " seconds to reach MeshLink, given that your node's clock is accurate.");}
      if(message.text.startsWith(pref + "e ") || message.text.startsWith(pref + "echo "))
      {
        if(message.text.startsWith(pref + "echo ")) var msg = message.text.substring(5);
        else msg = message.text.substring(2);
        if(msg.startsWith(" ")) msg = msg.substring(1);
        sendMessage(msg);
      }
      if(message.text.startsWith(pref + "weather") || message.text.startsWith(pref + "w"))
      {
        await fetch('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=31.433002&lon=-100.470352', {
          method: 'GET',
          headers: {
            'User-Agent': 'MeshLink/1.0'
          }
        })
        .then(res => res.json())
        .then(data => {
          const timeseries = data.properties.timeseries;
          if (timeseries && timeseries.length > 0) {
            const firstEntry = timeseries[0];
            const entries = firstEntry.data.instant.details;
            const temperature = Math.round((entries.air_temperature * 9/5) + 32);
            function degreesToCardinal(degrees) {
              const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
              const index = Math.round(degrees / 22.5) % 16;
              return directions[index];
            }

            const windDirection = degreesToCardinal(entries.wind_from_direction);
            sendMessage(`Temp: ${temperature}°F\nHum: ${entries.relative_humidity}%\nWind: ${Math.round(entries.wind_speed * 2.237)}mph\nWind Dir: ${windDirection}\nPrecip (1hr): ${Math.round(firstEntry.data.next_1_hours.details.precipitation_amount / 25.4)}in\nCond: ${firstEntry.data.next_1_hours.summary.symbol_code}`);
          } else {
            sendMessage("Weather data is currently unavailable.");
          }
        })
        .catch(error => {
          console.error("Error fetching weather data:", error);
          sendMessage("Failed to fetch weather data. Please try again later.");
        });
      }
      if(message.text.startsWith(pref + "forecast") || message.text.startsWith(pref + "f"))
      {
        await fetch('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=31.433002&lon=-100.470352', {
          method: 'GET',
          headers: {
            'User-Agent': 'MeshLink/0.1.0'
          }
        })
        .then(res => res.json())
        .then(data => {
          const timeseries = data.properties.timeseries;
          if (timeseries && timeseries.length > 0) {
            const sixhrs = timeseries[5];
            const twelvehrs = timeseries[11];
            const twentyfourhrs = timeseries[23];
            sendMessage(`6hrs:\nTemp: ${Math.round((sixhrs.data.instant.details.air_temperature * 9/5) +32)}\nCond: ${sixhrs.data.next_1_hours.summary.symbol_code}\n\n12hrs:\nTemp: ${Math.round((twelvehrs.data.instant.details.air_temperature * 9/5) +32)}\nCond: ${twelvehrs.data.next_1_hours.summary.symbol_code}\n\n24hrs:\nTemp: ${Math.round((twentyfourhrs.data.instant.details.air_temperature * 9/5) +32)}\nCond: ${twentyfourhrs.data.next_1_hours.summary.symbol_code}`);
          } else {
            sendMessage("Weather data is currently unavailable.");
          }
        })
        .catch(error => {
          console.error("Error fetching weather data:", error);
          sendMessage("Failed to fetch weather data. Please try again later.");
        });
      }
    }
    else
    {
      sendMessage("Unknown command. Type " + pref + "help for a list of commands.");
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
