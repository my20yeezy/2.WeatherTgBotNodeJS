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
  .catch(err => console.error('Database connection error', err));

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
    console.log("User location saved/updated successfully!");
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
    const city = response.data[0]?.name || "Unknown location";

    await saveUserLocation(chatId, latitude, longitude, city);

    bot.sendMessage(chatId, `Your location has been saved as ${city}.`);
  } catch (error) {
    bot.sendMessage(chatId, "Failed to save location. Please try again.");
  }
});

bot.on('text', async msg => {
  console.log(msg);
})

// Send daily weather updates
async function sendDailyWeatherUpdates() {
  try {
    const res = await db.query("SELECT * FROM users3");
    res.rows.forEach(async (user) => {
      const { telegram_id, city } = user;

      if (!city) return;

      try {
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${openWeatherApiKey}`
        );
        const data = response.data;
        const weather = data.weather[0].description;
        const temperature = data.main.temp - 273.15;
        const message = `Good morning! The weather in ${city} today is ${weather} with a temperature of ${temperature.toFixed(2)}°C.`;

        bot.sendMessage(telegram_id, message);
      } catch (error) {
        console.error(`Failed to get weather data for ${city}:`, error.message);
      }
    });
  } catch (err) {
    console.error("Error fetching user data:", err.message);
  }
}


// Schedule task to run every day at 08:30 AM
cron.schedule("00 22 * * *", () => {
  sendDailyWeatherUpdates();
});