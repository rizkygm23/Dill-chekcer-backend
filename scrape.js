const mysql = require('mysql2/promise');
const { timeout } = require('puppeteer');
const puppeteer = require('puppeteer');

// Buat koneksi ke MySQL
const pool = mysql.createPool({
  host: 'bt8d8ug5hpoxdwsukll6-mysql.services.clever-cloud.com',
  user: 'utrs1etdedrsx5og',
  password: 'nGaXw8vAZUlBJgzNpdQw',
  database: 'bt8d8ug5hpoxdwsukll6',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 3
});

// Fungsi delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scrapeValidator = async (pubkey) => {
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    try {
      await page.goto(`https://alps.dill.xyz/validators?p=3&ps=25&pubkey=${pubkey}`);
      await page.waitForSelector('.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-1.css-1doag2i', { timeout: 10000 });
    } catch (TimeoutError) {
      console.error('Error waiting for selector:', puppeteer.TimeoutError);
      await browser.close();
      return null;
    }
    const balanceValue = await page.evaluate(() => {
      const elements = document.querySelectorAll('h6');
      let balanceText = null;
      elements.forEach(element => {
        if (element.textContent.includes('Balance')) {
          const balanceElement = element.nextElementSibling;
          if (balanceElement) {
            balanceText = balanceElement.textContent.trim();
          }
        }
      });

      const balanceNumber = balanceText.match(/[\d,]+(\.\d+)?/);
      return balanceNumber ? balanceNumber[0].replace(/,/g, '') : null;
    });

    await browser.close();
    return balanceValue;

  } catch (error) {
    console.error('Error scraping validator:', error);
    if (browser) await browser.close();
    return null;
  }
};

const processValidators = async () => {
  try {
    const [validators] = await pool.query('SELECT pubkey, balance FROM validator');
    console.log('Retrieved validators:', validators.length);
	let index = 0;

    for (const validator of validators) {
	console.log(`Processing index: ${index++}`);
      const { pubkey, balance: lastBalance } = validator;
      console.log(`Processing pubkey: ${pubkey}`);
      const newBalance = await scrapeValidator(pubkey);
      
      if (newBalance) {
        await pool.query('UPDATE validator SET last_balance = balance, balance = ? WHERE pubkey = ?', [newBalance, pubkey]);

        console.log(`Pubkey: ${pubkey}`);
        console.log(`Last Balance: ${lastBalance}`);
        console.log(`New Balance: ${newBalance}`);
        console.log('------------------------');
      }

      // Tambahkan delay 10 detik setelah setiap scraping selesai
      await sleep(2000);
    }
  } catch (error) {
    console.error('Error processing validators:', error);
  }
};

const startScrapingLoop = async () => {
  console.log('Starting scraping process...');
  await processValidators();
  console.log('Scraping process completed.');

  // Set interval setiap 5 menit untuk menjalankan kembali proses
  setInterval(async () => {
    console.log('Restarting scraping process...');
    await processValidators();
  }, 60000); // 300000 ms = 5 menit
};

// Jalankan proses scraping langsung
startScrapingLoop();
