require('dotenv').config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const { Client } = require("pg");
const cron = require("node-cron");

const token = process.env.TELEGRAM_BOT_TOKEN;
const openWeatherApiKey = process.env.OPENWEATHER_API_KEY;
const dbUrl = process.env.DATABASE_URL;

const db = new Client({
  connectionString: dbUrl,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});
// const db = new Client({
//   user: "postgres",
//   host: "localhost",
//   database: "ErnieWeatherBot",
//   password: "ernie",
//   port: 5432,
// });

db.connect()
  .then(() => console.log('Connected to PostgreSQL database on Railway'))
  .catch((err) => {
    console.error("Database connection error", err.message);
    setTimeout(connectToDatabase, 5000);
  });

  db.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
    db.end();
    setTimeout(connectToDatabase, 5000);
  });

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
console.log('Bot Token:', process.env.TELEGRAM_BOT_TOKEN);

// Save user data in DB
async function saveUserLocation(telegramId, latitude, longitude, city) {
  try {
    await db.query(
      `INSERT INTO users3 (telegram_id, latitude, longitude, city)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE 
       SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, city = EXCLUDED.city`,
      [telegramId, latitude, longitude, city]
    );
    console.log(`User ${telegramId} location saved/updated successfully as ${city}!`);
  } catch (err) {
    console.error("Error saving user location:", err.message);
  }
}

// Get location messages from users
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  try {
    const response = await axios.get(
      `http://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${openWeatherApiKey}`
    );
    // const city = response.data[0]?.name || "Unknown location";
    const response_city = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${openWeatherApiKey}`
      // `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${openWeatherApiKey}`
    );
    const data = response_city.data;
    const city = data.name;

    await saveUserLocation(chatId, latitude, longitude, city);

    bot.sendMessage(chatId, `Your location has been saved as ${city}.`);
  } catch (error) {
    bot.sendMessage(chatId, "Failed to save location. Please try again.");
  }
});

bot.on('text', async msg => {
  console.log(msg);
})

bot.on('location', async msg => {
  console.log(msg);
})

// Send daily weather updates
async function sendWeatherUpdate() {
  try {
    const res = await db.query("SELECT * FROM users3");
    res.rows.forEach(async (user) => {
      const { telegram_id, latitude, longitude} = user;
      if (!latitude || !longitude) return;

      try {
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${openWeatherApiKey}`
          // `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${openWeatherApiKey}`
        );
        const data = response.data;
        const weather = data.weather[0].description;
        const temperature = data.main.temp;
        const feels_like = data.main.feels_like;
        const city = data.name;
        const message = `Hello! The weather in ${city} now is ${weather} with a temperature of ${temperature.toFixed(2)}°C, which feels like ${feels_like}°C.`;

        bot.sendMessage(telegram_id, message);
        console.log(`Sent weather update "${message}" to user ${telegram_id}`);
      } catch (error) {
        console.error(`Failed to get weather data:`, error.message);
      }
    });
  } catch (err) {
    console.error("Error fetching user data:", err.message);
  }
}


// Schedule tasks to weather updates
cron.schedule("00 03 * * *", () => {
  sendWeatherUpdate();
});

// cron.schedule("00 13 * * *", () => {
//   sendWeatherUpdate();
// });