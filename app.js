// Load up the discord.js library
const Discord = require("discord.js");

// Create the main client object with methods to interface with Discord
const client = new Discord.Client();

// Here we load the config.json file that contains our token and our prefix values. 
const config = require("./config.json");
// config.token contains the bot's token
// config.prefix contains the message prefix.
// config.gmapsApiKey contains the bot's Google Maps Static API key

var isPurgeEnabled = true;

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
    
    
    
    // post enhanced raid info in channel
    postRaidInfo(message.channel, raidInfo);
    
    if (isReplaceGymHuntrBotPost) {
      // delete the original GymHuntrBot post
      message.delete().catch(O_o=>{});
    }
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
  
  // post raid info for the active raid at 
  // the location entered (must be entered exactly as written in GymHuntrBot's original post / the PoGo gym name)
  // e.g. +info Washington's Crossing
  if (command === "info") {
    const enteredLoc = args.join(' ').replace(/\*|\./g, '').trim(); // also remove any asterisks and .'s
    await findRaid(enteredLoc)
        .then(raidInfo => {
          if (raidInfo) {
            //postRaidInfo(message.channel, raidInfo);
          } else {
            message.reply(`Sorry ${message.author}, I couldn't find an active raid at ${enteredLoc}. Please check that you entered the location name correctly.`);
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

// search through previous self posts for raid information
// TODO much better to have a database of raid information instead of searching and parsing through post history
async function findRaid(enteredLoc) {
  var foundRaidInfo = false;
  for (let [chkey, ch] of client.channels) { // all channels in all servers - dangerous
    if (ch.type != 'text')
      continue;
    
    // search last X messages in all channels -- dangerous!! potentially super slow
    await ch.fetchMessages({limit: raidlastMaxMessagesSearch}) 
      .then(messages => {
        for (let [key, msg] of messages) {
          // only process msg if msg by this bot and in right format
          if (msg.author.id != client.user.id || !msg.embeds[0])
            continue;
          
          // parse previous post
          const raidInfo = parseRaidInfo(msg);
          
          // check if location name matches the given name
          if (raidInfo.cleanLoc.toLowerCase() != enteredLoc.toLowerCase()) {
            continue;
          }
          
          // check if there is still time remaining in the raid
          if (raidInfo.raidTime.isBefore(moment())) {
            continue;
          }
          
          foundRaidInfo = raidInfo;
          break;
        }
      });
    if (foundRaidInfo)
      break;
  }
  return foundRaidInfo;
}

// process a GymHuntrBot message - create a new channel for coordinating the raid
async function parseGymHuntrbotMsg(lastBotMessage) {
  const emb = lastBotMessage.embeds[0];
  
  // get the pokemon thumbnail
  const thumbUrl = emb.thumbnail.url;
  
  // get the GPS coords and google maps URL
  const gpsCoords = new RegExp('^.*#(.*)','g').exec(emb.url)[1];
  const gmapsUrl = gmapsUrlBase + gpsCoords;
  const gmapsGeocodeOpts = {
    method: 'GET',
    uri: 'https://maps.googleapis.com/maps/api/geocode/json',
    qs: {
      key: config.gmapsApiKey,
      latlng: gpsCoords
    },
    headers: {
        'User-Agent': 'Request-Promise'
    },
    json: true // Automatically parses the JSON string in the response
  }
  const gmapsLinkName = await rp(gmapsGeocodeOpts)
    .then(response => {
      const gmapsFAddress = response.results[0].formatted_address;
      return 'Map: ' + gmapsFAddress.split(',').slice(0, 2).join(',').replace('Township', 'Twp');
    })
    .catch(error => {
       console.log(`Google Maps reverse geocoding failed for coordinates ${gpsCoords}. Error: ${error}`);
       return 'Open in Google Maps';
    });
  console.log(gmapsLinkName);
  
  const descrip = emb.description;
  const parts = descrip.split('\n'); // location name is parts[0], name is parts[1], time left is parts[3]
    
  // extract the pokemon name
  const pokemonName = parts[1];
  var shortPokemonName = pokemonName.toLowerCase();
  for (var i = 0; i < shortPokemonNames.length; i++) { // shorten pokemon names
    shortPokemonName = shortPokemonName.replace(shortPokemonNames[i][0], shortPokemonNames[i][1]);
  }
  shortPokemonName = shortPokemonName.substring(0, maxPokemonNameLength);
  
  // clean up location name
  const loc = parts[0];
  const cleanLoc = loc.replace(/\*|\./g, ''); // remove bold asterisks and trailing .
  var shortLoc = loc.toLowerCase().replace(/\s|_/g, '-').replace(/[^\w-]/g, '');
  for (var i = 0; i < shortLocNames.length; i++) { // shorten location names
    shortLoc = shortLoc.replace(shortLocNames[i][0], shortLocNames[i][1]);
  }
  shortLoc = shortLoc.substring(0, maxLocNameLength);
  shortLoc = shortLoc.replace(/-/g, ' ').trim().replace(/\s/g, '-'); // trim trailing -
  
  // extract the time remaining and compute the end time
  // don't include seconds -- effectively round down
  const timeRegex = new RegExp(/\*Raid Ending: (\d+) hours (\d+) min \d+ sec\*/g);
  const raidTimeParts = timeRegex.exec(parts[3]);
  const raidTime = moment(lastBotMessage.createdAt).add(raidTimeParts[1], 'h').add(raidTimeParts[2], 'm');
  const raidTimeStr = raidTime.format('h-mma').toLowerCase();
  const raidTimeStrColon = raidTime.format('h:mma');
  const raidTimeRemaining = `${raidTimeParts[1]} h ${raidTimeParts[2]} m remaining`;
    
  return {
    pokemonName: pokemonName, 
    shortPokemonName: shortPokemonName, 
    cleanLoc: cleanLoc, 
    shortLoc: shortLoc, 
    raidTime: raidTime, 
    raidTimeStr: raidTimeStr, 
    raidTimeStrColon: raidTimeStrColon, 
    raidTimeRemaining: raidTimeRemaining, 
    thumbUrl: thumbUrl, 
    gpsCoords: gpsCoords, 
    gmapsUrl: gmapsUrl,
    gmapsLinkName: gmapsLinkName
  }
}

async function postRaidInfo(channel, raidInfo) {
  const newEmbed = new Discord.RichEmbed()
    .setTitle(`${raidInfo.cleanLoc}`)
    .setDescription(`**${raidInfo.pokemonName}**\nUntil **${raidInfo.raidTimeStrColon}** (${raidInfo.raidTimeRemaining})\n**[${raidInfo.gmapsLinkName}](${raidInfo.gmapsUrl})**`)
    .setThumbnail(`${raidInfo.thumbUrl}`)
    .setColor(embedColor);
  if (isMapImageEnabled) {
    newEmbed.setImage(`https://maps.googleapis.com/maps/api/staticmap?center=${raidInfo.gpsCoords}&zoom=15&scale=1&size=600x600&maptype=roadmap&key=${config.gmapsApiKey}&format=png&visual_refresh=true&markers=size:mid%7Ccolor:0xff0000%7Clabel:%7C${raidInfo.gpsCoords}`);
  }
  channel.send({embed: newEmbed});
}

client.login(config.token);
