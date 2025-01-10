/* eslint-disable no-undef */
import http from 'http';
import url from 'url';
import { MongoClient } from 'mongodb';
const PORT = process.env.PORT || 3000;
const uri = 'mongodb://127.0.0.1:27017/government';

// Create a server
const server = http.createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', 86400); // 24 hours

    // Parse URL
    const parsedUrl = url.parse(req.url, true);
    

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Handle POST requests to /api/login
    if (req.method === 'POST' && parsedUrl.pathname === '/api/login') {
        let body = '';

        // Accumulate request body
        req.on('data', chunk => {
            body += chunk.toString();
        });

        // When request body is fully received
        req.on('end', async () => {
            const { governmentID, govpassword } = JSON.parse(body);
            console.log(`Login attempt for governmentID: ${governmentID}`);

            const client = new MongoClient(uri);

            try {
                await client.connect();
                const database = client.db('government');
                const collection = database.collection('details');

                const user = await collection.findOne({ governmentID: governmentID });
                if (!user) {
                    console.log('User not found');
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ m1: 'Invalid ID or password' }));
                    return;
                }

                console.log('User found, comparing passwords...');
                if (user.govpassword === govpassword) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ m1: 'Login successful' }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ m1: 'Invalid ID or password' }));
                }
            } catch (error) {
                console.error(error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ m1: 'Internal server error' }));
            } finally {
                await client.close();
            }
        });
        return;
    }

    /// Handle GET requests to fetch all ward updates
if (req.method === 'GET' && parsedUrl.pathname === '/api/all-ward-updates') {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('ward');
        const collection = database.collection('dailyUpdates');
        const complaintsCollection = database.collection('complaints');

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0); // Set to start of day
        const oneDayAgo = new Date(currentDate - 24 * 60 * 60 * 1000);

        const allUpdates = await collection.aggregate([
            {
                $group: {
                    _id: '$wardmailID',
                    wardNumber: { $first: '$wardNumber' },
                    rating: { $avg: '$rating' },
                    lastUpdateDate: { $max: '$date' }
                }
            }
        ]).toArray();

        const updatedWardInfo = await Promise.all(allUpdates.map(async (ward) => {
            // Calculate missed update count
            const missedUpdateCount = Math.max(0, Math.floor((currentDate - ward.lastUpdateDate) / (24 * 60 * 60 * 1000)));

            // Check for late responses (complaints not addressed within 24 hours)
            const lateComplaints = await complaintsCollection.countDocuments({
                wardNumber: ward.wardNumber,
                date: { $lt: oneDayAgo },
                $or: [
                    { response: { $exists: false } },
                    { 'response.date': { $gt: oneDayAgo } }
                ]
            });

            return {
                _id: ward._id,
                wardNumber: ward.wardNumber,
                rating: ward.rating,
                lastUpdateDate: ward.lastUpdateDate,
                missedUpdateCount: missedUpdateCount,
                lateResponses: lateComplaints
            };
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updatedWardInfo));
    } catch (error) {
        console.error('Error fetching all ward updates:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ m1: 'Internal server error' }));
    } finally {
        await client.close();
    }
    return;
}
    // Handle GET requests to fetch penalties for a specific ward
if (req.method === 'GET' && parsedUrl.pathname.startsWith('/api/ward-penalties/')) {
    const wardNumber = parseInt(parsedUrl.pathname.split('/')[3]);

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('ward');
        const collection = database.collection('dailyUpdates');
        const complaintsCollection = database.collection('complaints');

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0); // Set to start of day
        const oneDayAgo = new Date(currentDate - 24 * 60 * 60 * 1000);

        const lastUpdate = await collection.findOne(
            { wardNumber: wardNumber },
            { sort: { date: -1 } }
        );

        if (!lastUpdate) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Ward not found' }));
            return;
        }

        // Calculate missed update count
        const missedUpdateCount = Math.max(0, Math.floor((currentDate - lastUpdate.date) / (24 * 60 * 60 * 1000)));

        // Check for late responses (complaints not addressed within 24 hours)
        const lateComplaints = await complaintsCollection.countDocuments({
            wardNumber: wardNumber,
            date: { $lt: oneDayAgo },
            $or: [
                { response: { $exists: false } },
                { 'response.date': { $gt: oneDayAgo } }
            ]
        });

        const penalties = [];
        if (missedUpdateCount > 0) {
            penalties.push({ reason: `Missed updates (${missedUpdateCount} day${missedUpdateCount > 1 ? 's' : ''})`, amount: missedUpdateCount * 100 });
        }
        if (lateComplaints >= 1) {
            penalties.push({ reason: 'Late responses', amount: 500 });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(penalties));
    } catch (error) {
        console.error('Error fetching penalties:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Internal server error' }));
    } finally {
        await client.close();
    }
    return;
}
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ m1: 'Not found' }));
});

server.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});