// Manual helper to post test_payload.json to the driver route endpoint.
const http = require('http');
const fs = require('fs');

const data = fs.readFileSync('test_payload.json');

const options = {
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/driver/route',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (e) => {
    console.error(`ERROR: ${e.message}`);
});

req.write(data);
req.end();
