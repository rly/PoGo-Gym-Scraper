// Load up the discord.js library
const Discord = require("discord.js");

// Load sqlite3 library
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database('gymdetails');
//CREATE TABLE gym (name TEXT COLLATE NOCASE, latitude DOUBLE, longitude DOUBLE);
//CREATE UNIQUE INDEX gym_index ON gym(name COLLATE NOCASE);
const gymInsert = db.prepare("INSERT INTO gym VALUES (?,?,?)");

// print whole database
db.each(`SELECT * FROM gym`, 
  (err, row) => console.log(row)
);

db.on("error", error => console.log("Database error: ", error));

// Create the main client object with methods to interface with Discord
const client = new Discord.Client();

// Here we load the config.json file that contains our token and our prefix values. 
const config = require("./config.json");
// config.token contains the bot's token
// config.prefix contains the message prefix.
// config.gmapsApiKey contains the bot's Google Maps Static API key

var isPurgeEnabled = true;

const gmapsUrlBase = 'https://www.google.com/maps/search/?api=1&query=';

// info on GymHuntrBot
const gymHuntrbotName = "GymHuntrBot";

const embedColor = 0xd28ef6;

client.on("ready", () => {
  // This event will run if the bot starts, and logs in, successfully.
  console.log(`Bot has started, with ${client.users.size} users, in ${client.channels.size} channels of ${client.guilds.size} guilds.`); 
  client.user.setGame(`on ${client.guilds.size} servers`);
});

client.on("guildCreate", guild => {
  // This event triggers when the bot joins a guild.
  console.log(`New guild joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`);
  client.user.setGame(`on ${client.guilds.size} servers`);
});

client.on("guildDelete", guild => {
  // this event triggers when the bot is removed from a guild.
  console.log(`I have been removed from: ${guild.name} (id: ${guild.id})`);
  client.user.setGame(`on ${client.guilds.size} servers`);
});


client.on("message", async message => {
  // This event will run on every single message received, from any channel or DM.
  
  // if gymhuntrbot posts in the huntrbot channel, process it here
  const gymHuntrbotId = client.users.find('username', gymHuntrbotName).id; // user id (global)
  if (message.author.bot && message.author.id === gymHuntrbotId && message.embeds[0]) {
    // parse GymHuntrBot raid announcement
    const raidInfo = await parseGymHuntrbotMsg(message);
    
    // add the location and lat/lng to the database
    gymInsert.run(raidInfo.cleanLoc, raidInfo.latitude, raidInfo.longitude, error => {
      if (!error) {
        console.log(`Added ${raidInfo.cleanLoc}: ${raidInfo.latitude},${raidInfo.longitude} to database.`);
        message.reply(`Added ${raidInfo.cleanLoc}: ${raidInfo.latitude},${raidInfo.longitude} to database.`);
      } else {
        console.log(`Error adding ${raidInfo.cleanLoc} to database: ${error}.`);
      }
    });
  }
  
  if (message.author.bot) return;
  
  // Ignore any message that does not start with our prefix, 
  if (message.content.indexOf(config.prefix) !== 0) return;
  
  // Here we separate our "command" name, and our "arguments" for the command. 
  // e.g. if we have the message "+say Is this the real life?" , we'll get the following:
  // command = say
  // args = ["Is", "this", "the", "real", "life?"]
  const args = message.content.split(/\s+/g);
  const command = args.shift().slice(config.prefix.length).toLowerCase();
    
  if (command === "ping") {
    // Calculates ping between sending a message and editing it, giving a nice round-trip latency.
    // The second ping is an average latency between the bot and the websocket server (one-way, not round-trip)
    const m = await message.channel.send("Ping?");
    m.edit(`Pong! Latency is ${m.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(client.ping)}ms`);
  }
  
  if (command === "say") {
    // makes the bot say something and delete the message. As an example, it's open to anyone to use. 
    // To get the "message" itself we join the `args` back into a string with spaces: 
    const sayMessage = args.join(" ");
    // Then we delete the command message (sneaky, right?). The catch just ignores the error with a cute smiley thing.
    message.delete().catch(O_o=>{}); 
    // And we get the bot to say the thing: 
    message.channel.send(sayMessage);
  }
  
  if (isPurgeEnabled && command === "purge") {
    // This command removes all messages from all users in the channel, up to 100.
    // First message is the purge command.
    if (!checkPermissionsManageChannel(message) || !checkPermissionsManageMessages(message)) return false;

    // get the delete count, as an actual number.
    const deleteCount = parseInt(args[0], 10);
    
    // Ooooh nice, combined conditions. <3
    if (!deleteCount || deleteCount < 2 || deleteCount > 100)
      return message.reply("Please provide a number between 2 and 100 for the number of messages to delete");
    
    // delete the specified number of messages, newest first. 
    message.channel.bulkDelete(deleteCount)
        .catch(error => message.reply(`I couldn't delete messages because of: ${error}`));
  }
  
  // get a Google Maps url based on the gym name. not case sensitive. periods and asterisks are removed.
  // e.g. +whereis washington's crossing
  if (command === "where" || command === "whereis" || command === "map") {
    const enteredLoc = args.join(' ').replace(/\*/g, '').trim(); // remove any asterisks
    findRaidCoords(enteredLoc, results => {
      if (results != null && results.length > 0) {
        for (row of results) {
          message.reply(`**${row.name}**: ${gmapsUrlBase}${row.latitude},${row.longitude}`);
        }
      } else {
        message.reply(`Sorry, I couldn't find a gym named **${enteredLoc}**. Please check that you entered the name correctly.`);
      }
    });
  }
});


function checkPermissionsManageChannel(message) {
  if (!message.channel.permissionsFor(message.member).has('MANAGE_CHANNELS')) {
    message.reply(`Sorry, you do not have permission to do this.`);
    return false;
  }
  return true;
}

function checkPermissionsManageMessages(message) {
  if (!message.channel.permissionsFor(message.member).has('MANAGE_MESSAGES')) {
    message.reply(`Sorry, you do not have permission to do this.`);
    return false;
  }
  return true;
}

// TODO see if async/await can be used here
function findRaidCoords(enteredLoc, callback) {
  db.all(`SELECT name,latlng FROM gym where name like '${enteredLoc}'`, 
    (err, rows) => {
      if (err) {
        console.log(`Database error finding raid: ${err}`);
        callback(null);
      } else {
        callback(rows);
      }
    }
  );
}

// process a GymHuntrBot message - create a new channel for coordinating the raid
async function parseGymHuntrbotMsg(lastBotMessage) {
  const emb = lastBotMessage.embeds[0];
  
  // get the lat/lng
  const gpsCoords = new RegExp('^.*#(.*)','g').exec(emb.url)[1].split(',');
  const latitude = gpsCoords[0];
  const longitude = gpsCoords[1];
  
  // clean up location name
  const cleanLoc = emb.description.split('\n')[0].replace(/\*/g, '').slice(0, -1).trim(); // remove bold asterisks and trailing .
    
  return {
    cleanLoc: cleanLoc, 
    gpsCoords: gpsCoords, 
    latitude: latitude,
    longitude: longitude
  }
}

process.on('SIGINT', () => {
  gymInsert.finalize();
  db.close();
  process.exit(0);
});

client.login(config.token);
