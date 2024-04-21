const express = require("express");
const http = require('http');
const WebSocket = require('ws');
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const axios = require('axios');

// Initialize express app and HTTP server
const app = express();
const server = http.createServer(app);

// Apply essential middleware
console.log("Registering middleware...");
app.use(helmet()); // Adds various security headers to make the app more secure
app.use(cors({
    origin: function (origin, callback) {
        const whitelist = process.env.NODE_ENV === 'production' ? 
            ['http://localhost:8006', 'http://localhost:8003', 'http://localhost:9000'] : 
            ['http://localhost:8006', 'http://localhost:8003', 'http://localhost:9000'];
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));
console.log("Middleware registered.");

// Rate limiting to protect against brute-force attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// WebSocket server setup on the same port as HTTP server
const wss = new WebSocket.Server({ server });
let clients = []; // This will keep track of all connected clients

wss.on('connection', function connection(ws) {
    clients.push(ws); // Add new client to the array
    console.log('Client connected');

    ws.on('message', function incoming(message) {
        console.log('Received from client: %s', message);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients = clients.filter(client => client !== ws); // Remove disconnected client
    });
});

// Function to send current prediction result to all connected clients
function sendPredictionResult() {
    const data = { predictionResult: lastPredictionResult };
    const dataString = JSON.stringify(data);
    console.log("Ready to send to clients:", dataString); // Log what is being sent
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            console.log('Sending to client:', dataString);
            client.send(dataString);
        }
    });
}

// API endpoints
let lastPredictionResult = null;

app.post('/api/client-data', async (req, res) => {
    try {
        const predictionResponse = await axios.post(`${process.env.PREDICTION_API}/predict-moisture`, req.body);
        lastPredictionResult = predictionResponse.data;
        sendPredictionResult();
        console.log('lastPredictionResult:',lastPredictionResult);
        res.status(200).json({
            message: 'Data received and processed successfully',
            predictionResult: predictionResponse.data
        });
    } catch (error) {
        console.error('Failed to process client data:', error);
        res.status(500).json({ error: 'Error processing client data' });
    }
});

app.get('/api/get-prediction', (req, res) => {
    if (lastPredictionResult) {
        res.json(lastPredictionResult);
    } else {
        res.status(404).json({ error: 'No prediction data available' });
    }
});


app.post('/api/predict-moisture', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.PREDICTION_API}/predict-moisture`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Failed to fetch prediction:', error);
        res.status(500).json({ error: 'Error fetching prediction' });
    }
});

app.get("/", (req, res) => {
    res.send("Service is running");
});

// Error handling
app.use((req, res, next) => {
    res.status(404).json({ message: "Not Found" });
});

app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
});

// Start the server
const PORT = process.env.PORT || 5050;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}).on("error", (err) => {
    console.error("Failed to start server:", err);
});
