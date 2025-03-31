//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//IMPORTS
import TCPConnection from "@liamcottle/meshcore.js/src/connection/tcp_connection.js";
import Constants from "@liamcottle/meshcore.js/src/constants.js";
import mysql from 'mysql2/promise';

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//GLOBAL VARIABLES
var enableFlood = process.env.FLOOD_ADVERT_ON_START; //If true, MeshLink will tell the meshcore node to send a flood advert to the mesh.
var pref = process.env.PREFIX; //command prefix; can be changed in docker compose file or by using a .env flle.
var ver = "0.2.0";
var msver = "1.4.1";
var lat = process.env.LATITUDE; //Used for advert and also for weather
var lon = process.env.LONGITUDE; //Used for advert and also for weather
var ip = process.env.IP; //IP address if the meshcore node to connect to 
var port = process.env.PORT; //Port of the meshcore node
var nodename = process.env.NODENAME + " (" + pref + "h)"; //can be configured using docker compose, automatically adds prefix and help command to end of the nodename.
var weatherapi = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`; //This project uses met.no for weather, and the weather commands are designed to parse data from their API.

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//CREDITS/INFO
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

//log connection details
console.log("Connecting to MeshCore device...");
console.log("IP: " + ip);
console.log("Port: " + port);

//Create a new MeshCore connection
const connection = new TCPConnection(ip, port);

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//COMMAND HANDLER

async function onContactMessageReceived(message) {
  console.log("\nReceived contact message.\nSender Public Key Prefix: " + message.pubKeyPrefix + "\nMessage: " + message.text + "\n");

  // find first contact matching pub key prefix
  const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
  if (!contact) {
    console.log("Did not find contact for received message");
    return;
  }

  //Handle commands
  if (message.text.startsWith(pref)) {
    if (message.text.startsWith(pref + "h") || message.text.startsWith(pref + "help")) helpCommand(message.text); //optional argument
    else if (message.text == pref + "p" || message.text == pref + "ping") pingCommand(); //void
    else if (message.text.startsWith(pref + "weather") || message.text == (pref + "w")) weatherCommand(); //void
    else if (message.text.startsWith(pref + "forecast") || message.text == (pref + "f")) forecastCommand(); //void
    else if (message.text == pref + "a" || message.text == pref + "about") aboutCommand(); //void
    else if (message.text.startsWith(pref + "t ") || message.text.startsWith(pref + "timer ")) timerCommand(message);
    else {
      await sendMessage("Command not found. Use " + pref + "help for a list of commands.");
    }
  }
  else {
    await sendMessage("Use " + pref + "help for a list of commands.");
  }

  //FUNCTIONS

  //Send contact a message
  async function sendMessage(msg) {
    console.log("Sending message: " + msg + "\n" + "to: " + contact.publicKey);
    await connection.sendTextMessage(contact.publicKey, msg, Constants.TxtTypes.Plain);
  }

  //uses an array of directions and a modulus operator to return a cardinal direction when given a number in degrees.
  //used for the weather and forecast commands
  function degreesToCardinal(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }

  //takes the message.text as an argument, splits it, and if it has arguments, sends a specific page.
  async function helpCommand(command) {
    var page;
    var args = command.split(" ");
    var pages = [
      "Commands: \n" + pref + "(h)elp [page] - Displays this message\n" + pref + "(p)ing - Ping MeshLink\n" + pref + "(w)eather - Displays the current weather",
      "Commands: \n" + pref + "(f)orecast - Displays weather forecast\n" + pref + "(t)imer [msg] [time in seconds] - Sets a timer\n" + pref + "(a)bout - About MeshLink"
    ]

    if (args.length > 2) {
      sendMessage("Too many arguments.");
      return;
    }

    //check for argument validity and set pages to 1 if the argument does not exist
    if (args[1]) {
      if (typeof parseInt(args[1]) != "number") {
        sendMessage("Please specify a page number, or leave blank to receive the first page of the help section.");
        return;
      }
      else if (parseInt(args[1]) > (pages.length) || parseInt(args[1]) < 1) {
        sendMessage("Page does not exist. Valid pages are a number between 1 and " + pages.length);
        return;
      }

      page = parseInt(args[1]);
    }

    //default page is 1 if a page is not specified
    else page = 1;

    //send page requested as well as list how many pages there are at the bottom of the text
    try {
      sendMessage(pages[page - 1] + `\n(${page}/${pages.length})`);
    }
    catch (e) {
      console.log(e);
    }
  }

  //Receives a message and sends a response.
  async function pingCommand() {
    var t1 = message.senderTimestamp * 1000; //Time when message was sent
    var t2 = Date.now(); //Time when message was received
    var diff = (t2 - t1) / 1000; //Difference in both times in seconds
    await sendMessage("Pong! Your message took approximately " + diff + " seconds to reach MeshLink, given that your node's clock is accurate.");
  }

  //fetches weather from met.no and formats it into a small message that can be sent over the mesh
  async function weatherCommand() //void
  {
    //fetches the url specified in weatherapi and then parses the response as json
    await fetch(weatherapi, {
      method: 'GET',
      headers: {
        'User-Agent': `MeshLink/${ver}`
      }
    })
      .then(res => res.json())
      .then(async data => {

        //goes down the heirchy to the usable weather data that we need.
        const timeseries = data.properties.timeseries;
        if (timeseries && timeseries.length > 0) { //if timeseries exists and has entries inside of it, continue
          const firstEntry = timeseries[0]; //first entry in timeseries (the current weather)
          const entries = firstEntry.data.instant.details; //all entries in the first entry
          const temperature = Math.round((entries.air_temperature * 9 / 5) + 32);
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

  async function forecastCommand() //void
  {
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

  //Sends meshlink info
async function aboutCommand() {
  await sendMessage("MeshLink is a server that runs on top of the MeshCore platform to provide some internet connected features, as well as some other utilities.");
  await sendMessage("Version: " + ver + "\nInternal MeshCore Version: " + msver + "\nMade by Luca\nhttps://angelomesh.com/meshlink");
}

async function timerCommand(msg) {
  if (msg.text == pref + "t help" || msg.text == pref + "timer help") {
    await sendMessage("Timer command usage: " + pref + "timer [name] [time] [unit] (Valid units are (s)econds, (m)inutes, and (h)ours");
    return;
  }
  // argument layout: /timer [name] [time] [unit]
  var args = msg.text.split(" ");
  args.splice(0, 1);
  if (args.length == 3 && typeof args[0] == "string" && typeof parseInt(args[1]) == "number" && typeof args[2] == "string") {

    var currentTime = Math.floor(Date.now() / 1000); // current unix epoch time in seconds
    var triggerTime; //epoch time in seconds when the timer should go off.
    var unit; //unit of time used as a string for the response message, since "s" and "seconds" are the same thing, etc.

    if (args[2] == "s" || args[2] == "seconds" || args[2] == "second") {
      triggerTime = currentTime + parseInt(args[1]);
      var unit = "seconds";
    }
    else if (args[2] == "m" || args[2] == "minutes" || args[2] == "minute") {
      triggerTime = currentTime + (parseInt(args[1]) * 60);
      var unit = "minutes";
    }
    else if (args[2] == "h" || args[2] == "hours" || args[2] == "hour") {
      triggerTime = currentTime + (parseInt(args[1]) * 3600);
      var unit = "hours";
    }
    else {
      await sendMessage("Invalid unit. Valid units are (s)econds, (m)inutes, and (h)ours.");
      return;
    }

    if (args[0].toString().length >= 12) {
      await sendMessage("Timer name too long. Must be 12 characters or less.");
      return;
    }
    else if (parseInt(args[1]) < 30 && unit == "seconds") {
      await sendMessage("Invalid time. Time must be above 30 seconds.");
      return;
    }
    else if (parseInt(args[1]) < 0) {
      await sendMessage("Invalid time. Time must be a positive integer.");
      return;
    }
    else if (args[1].toString().length > 12) {
      await sendMessage("Invalid time. Time argument must contain 12 digits or less.");
      return;
    }

    //console.log(args);
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

    const checkExistingTimers = await con.query(
      `SELECT * FROM Timers where TIMER_NAME=\'${args[0]}\' and CONTACT_PUBLIC_KEY_PREF=\'${msg.pubKeyPrefix}\';`
    );
    const checkNumberOfTimers = await con.query(
      `SELECT * FROM Timers where CONTACT_PUBLIC_KEY_PREF=\'${msg.pubKeyPrefix}\';`
    );
    if (checkExistingTimers[0].length > 0) {
      await sendMessage("Timer with that name already exists.");
      con.end();
      console.log("Ended database connection.");
      return;
    }
    else if (checkNumberOfTimers[0].length > 4) {
      await sendMessage("You have reached the maximum number of timers (5).");
      con.end();
      console.log("Ended database connection.");
      return;
    }
    query = `INSERT INTO Timers VALUES (\'${args[0]}\', \'${msg.pubKeyPrefix}\', ${triggerTime})`;
    try {
      await con.query(query)// fields contains extra meta data about results, if available
    } catch (err) {
      console.log(err);
    }

    con.end();
    await sendMessage("Timer \"" + args[0] + "\" set for " + args[1] + " " + unit + " Created successfully..");
    console.log("Ended database connection.");

    fetchTimers();

  }
  else {
    await sendMessage("Invalid syntax. " + pref + "timer [name] [time] [unit] (Valid units are (s)econds, (m)inutes, and (h)ours");
  }
}


}
// connect to meshcore device
await connection.connect();

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//CLASSES

//Timer class
//takes in SQL data and creates a timer object; reduces database queries
class Timer {
  constructor(prefix, timerName, triggerTime) {
    this.prefix = prefix;
    this.timerName = timerName;
    this.triggerTime = triggerTime;

    this.startMonitoring();
  }

  isTriggered(currentTime) {
    return currentTime >= this.triggerTime;
  }

  startMonitoring() {
    const interval = setInterval(async () => {

      //check if it is time to trigger a node alert
      if (this.isTriggered(Math.round(Date.now() / 1000))) {
        clearInterval(interval); //stop checking to see if it is time to trigger alert
        console.log(`Timer ${this.timerName} triggered.`);

        // Trigger the timer
        var pubpref = new Uint8Array(this.prefix.split(',').map(Number)); //split public prefix as a string and insert it into an array
        const contact = await connection.findContactByPublicKeyPrefix(pubpref); //find contact to notify using the public key prefix

        //contact not found
        if (!contact) {
          console.log("Did not find contact for received message");
          return;
        }

        //contact found! Send the message.
        console.log("Sending message to " + pubpref);
        try {
          await connection.sendTextMessage(contact.publicKey, "Timer " + this.timerName + " has gone off.", Constants.TxtTypes.Plain);
        } catch (e) {
          console.log(e);
        }

        //Query the database to delete the row we no longer need
        var query = `DELETE FROM Timers WHERE CONTACT_PUBLIC_KEY_PREF=\'${this.prefix}\' AND TIMER_NAME=\'${this.timerName}\' AND TRIGGER_TIME=${this.triggerTime};`;
        const con = await createDatabaseConnection();
        await con.query(query)
        con.end();

        //Find this object in global.timers
        const thisTimer = global.timers.find(timer =>
          timer.prefix === this.prefix &&
          timer.timerName === this.timerName &&
          timer.triggerTime === this.triggerTimer
        );

        //if the timer object is found, delete the timer object. we no longer need it.
        if (thisTimer) {
          const index = global.timers.indexOf(thisTimer);
          if (index > -1) {
            global.timers.splice(index, 1);
          }
          console.log("Successfully removed " + this.timerName + " from SQL database and global.timers.")
        }
      }
    }, 1000); // Check every second
  }
}

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//FUNCTIONS

//TODO: add argument to filter SQL results when function is called outside of the main body
//Queries the SQL database to fetch rows from the Timers table and insert them into global.timers
async function fetchTimers() {
  //connect to the database
  const con = await createDatabaseConnection();

  try {
    //Query the SQL server to create the Timers table if it does not already exist
    var query = "CREATE TABLE IF NOT EXISTS Timers (TIMER_NAME VARCHAR(255), CONTACT_PUBLIC_KEY_PREF VARCHAR(255), TRIGGER_TIME BIGINT);";
    await con.query(query);

    //Select all results from Timers
    const results = await con.query(
      'SELECT * FROM Timers;'
    );
    con.end();

    //Executes for every result found
    results[0].forEach(async result => {

      //If global.timers does not exist yet, create it
      if (!global.timers) {
        global.timers = [];
      }

      //Search global.timers to see if the timer we grabbed already exists in memory
      const existingTimer = global.timers.find(function (timer) {
        return timer.prefix === result.CONTACT_PUBLIC_KEY_PREF &&
          timer.timerName === result.TIMER_NAME &&
          timer.triggerTime === result.TRIGGER_TIME;
      });

      //If the timer we grabbed does not already exist in memory, make a new Timer object and add it to global.timers
      if (!existingTimer) {
        console.log("Adding timer \"" + result.TIMER_NAME + "\" from " + result.CONTACT_PUBLIC_KEY_PREF);
        const newTimer = new Timer(result.CONTACT_PUBLIC_KEY_PREF, result.TIMER_NAME, result.TRIGGER_TIME);
        global.timers.push(newTimer);
      }
      else console.log("Timer with the name " + result.TIMER_NAME + " already exists in memory. skipping...")
    });

  } catch (e) {
    console.log(e);
  }
}

//Create a new connection to the SQL Database using the credentials provided in the environment variables.
async function createDatabaseConnection() {
  return await mysql.createConnection({
    host: process.env.MYSQL_SERVER,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
}

//------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//LISTENERS

//auto reconnect on disconnect
connection.onDisconnected(async () => {
  console.log("Disconnected, reconnecting...");
  await connection.connect();
});

// listen for new messages and call onContactMessageReceived/onChannelMessageReceived
connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
    for (const message of waitingMessages) {
      if (message.contactMessage) {
        await onContactMessageReceived(message.contactMessage);
      }
    }
  } catch (e) {
    console.log(e);
  }
});

// wait until connected
connection.on("connected", async () => {

  // we are now connected
  console.log(`Connected to: [${connection.host}:${connection.port}]`);

  //log advert name
  console.log("Set advert name to " + nodename);
  await connection.setAdvertName(nodename);

  //log position details
  console.log("Set advert lat/lon to " + lat + ", " + lon);
  await connection.setAdvertLatLong(lat * 1000000, lon * 1000000); //Null Island Protection Program

  //This will send a flood advert if specified in the environment, otherwise a zero hop advert will be sent
  if (enableFlood == true) {
    console.log("Sending flood advert...\n");
    await connection.sendFloodAdvert();
  }
  else {
    console.log("Flood advert on start disabled. Sending zero hop advert...\n");
    await connection.sendZeroHopAdvert();
  }

  //Since the server is starting now is a good time to fetch data from the SQL Database
  fetchTimers();
  console.log("fetching timers from SQL database")
});