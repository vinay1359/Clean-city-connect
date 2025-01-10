import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { MongoClient, ObjectId } from 'mongodb';


async function getClient() {
    const client = new MongoClient(uri);
    await client.connect();
    return client;
}

const PORT = process.env.PORT || 3001;
const uri = 'mongodb://127.0.0.1:27017/ward';

const server = http.createServer(async(req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', 86400); // 24 hours

    // Parse URL
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    // Serve the login page as default
    if (req.method === 'GET' && pathname === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('Internal Server Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Serve ward pages (ward1.html, ward2.html, etc.)
    if (req.method === 'GET' && pathname.startsWith('/ward') && pathname.endsWith('.html')) {
        fs.readFile(path.join(__dirname, pathname), (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('Page not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Handle POST requests to /api/login
    if (req.method === 'POST' && pathname === '/api/login') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            const { wardmailID, wardpassword } = JSON.parse(body);
            console.log(`Login attempt for wardmailID: ${wardmailID}`);

            const client = new MongoClient(uri);

            try {
                await client.connect();
                const database = client.db('ward');
                const collection = database.collection('details');

                const user = await collection.findOne({ wardmailID: wardmailID });
                console.log('User found:', user);

                if (!user) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ m2: 'Invalid ID or password' }));
                } else {
                    if (wardpassword === user.wardpassword) {
                        const wardNumber = user.wardNumber;
                        console.log('Ward Number:', wardNumber);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ m2: 'Login successful', wardNumber }));
                    } else {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ m2: 'Invalid ID or password' }));
                    }
                }
            } catch (error) {
                console.error('Error in wardserver.js:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ m2: 'Internal server error' }));
            } finally {
                await client.close();
            }
        });
        return;
    }

    // Handle POST requests to /api/daily-update
    if (req.method === 'POST' && pathname === '/api/daily-update') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            const { wardmailID, wardNumber, workersArrived, garbageCollected, garbageLeft,rainyDay} = JSON.parse(body);
            console.log(`Daily update received from ${wardmailID}: (Ward Number ${wardNumber}): Workers Arrived: ${workersArrived}, Garbage Collected: ${garbageCollected}, Garbage Left: ${garbageLeft}, Rainy Day: ${rainyDay}`);

            const client = new MongoClient(uri);

            try {
                await client.connect();
                const database = client.db('ward');
                const collection = database.collection('dailyUpdates');

                // Check if an update has already been submitted today
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Set to start of the day
                const existingUpdate = await collection.findOne({ wardmailID: wardmailID, date: today });

                let rating = 0;
                let averageRating = 0;
                let m2 = '';
                if (existingUpdate) {
                    // If update already exists, return error
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ m2: 'Update already submitted today' }));
                    return;
                }

                // Calculate the rating for today based on selected options
                if (!rainyDay) {
                    if (workersArrived) rating += 1;
                    if (garbageCollected) rating += 1;
                    if (garbageLeft) rating += 1;
                }
                else {
                    m2= 'It is a rainy day. Please collect your garbage and keep it in one place, Wait for tomorrow, Have a good day!';
                }

                const newUpdate = {
                    wardmailID,
                    wardNumber,
                    date: today,
                    workersArrived: !rainyDay ? workersArrived : false, // Ensure false if rainyDay
                    garbageCollected: !rainyDay ? garbageCollected : false, // Ensure false if rainyDay
                    garbageLeft: !rainyDay ? garbageLeft : false,
                    rainyDay,// Ensure false if rainyDay
                    rating
                };

                    await collection.insertOne(newUpdate);
                
            

                // Calculate the average rating over all updates for this ward
                const updates = await collection.find({ wardmailID: wardmailID }).toArray();
                if (updates.length > 0) {
                    averageRating = updates.reduce((sum, update) => sum + update.rating, 0) / updates.length;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ m2, rating, averageRating }));
            } catch (error) {
                console.error('Error in wardserver.js:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ m2: 'Internal server error' }));
            } finally {
                await client.close();
            }
        });
        return;
    }




    // Handle POST requests to /api/submit-complaint
    if (req.method === 'POST' && pathname === '/api/submit-complaint') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { wardNumber, complaintText } = JSON.parse(body);
                console.log(`Complaint received from ward ${wardNumber}: ${complaintText}`);

                const client = await getClient();
                const database = client.db('ward');
                const collection = database.collection('complaints');

                const newComplaint = {
                    wardNumber: wardNumber.toString(),
                    complaintText: complaintText,
                    date: new Date(),
                    response: null
                };

                await collection.insertOne(newComplaint);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Complaint submitted successfully' }));

                // Optionally, implement notification logic here

            } catch (error) {
                console.error('Error submitting complaint:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Internal server error' }));
            }
        });
        return;
    }




    // ... (rest of the code remains the same)

    if (req.method === 'GET' && pathname.startsWith('/api/ward-complaints/')) {
        const wardNumber = pathname.split('/').pop();

        try {
            const client = await getClient();
            const database = client.db('ward');
            const collection = database.collection('complaints');
            const complaints = await collection.find({ wardNumber: wardNumber }).toArray();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(complaints));

            await client.close();
        } catch (error) {
            console.error('Error fetching complaints:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ m2: 'Internal server error' }));
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/submit-response') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { complaintId, responseText } = JSON.parse(body);
                console.log(`Response received for complaint ${complaintId}: ${responseText}`);

                const client = await getClient();
                const database = client.db('ward');
                const collection = database.collection('complaints');

                const result = await collection.updateOne(
                    { _id: new ObjectId(complaintId) },

                    {
                        $set: {
                            response: {
                                text: responseText,
                                date: new Date()
                            }
                        }
                    }
                );

                await client.close();

                if (result.modifiedCount === 1) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Response submitted successfully' }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Complaint not found' }));
                }
            } catch (error) {
                console.error('Error submitting response:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Internal server error' }));
            }
        });
        return;
    }







    if (req.method === 'GET' && pathname.startsWith('/api/ward-feedback/')) {
        const wardNumber = pathname.split('/').pop();
    
        try {
            const client = new MongoClient(uri);
            await client.connect();
            const database = client.db('ward');
            const collection = database.collection('feedback');
            const feedback = await collection.find({ wardNumber: wardNumber }).toArray();
    
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(feedback));
    
            await client.close();
        } catch (error) {
            console.error('Error fetching feedback:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ m2: 'Internal server error' }));
        }
        return;
    }





    if (req.method === 'GET' && pathname.startsWith('/api/ward-penalties/')) {
        const wardNumber = pathname.split('/').pop();
        const client = new MongoClient(uri);
        
        try {
            await client.connect();
            const database = client.db('ward');
            const updatesCollection = database.collection('dailyUpdates');
            const complaintsCollection = database.collection('complaints');
            
            const currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0); // Set to start of day
            const oneDayAgo = new Date(currentDate - 24 * 60 * 60 * 1000);
            
            // Check for missed updates
            const lastUpdate = await updatesCollection.findOne(
                { wardNumber: wardNumber },
                { sort: { date: -1 } }
            );
            
            const missedUpdateCount = lastUpdate ? Math.max(0, Math.floor((currentDate - lastUpdate.date) / (24 * 60 * 60 * 1000))) : 0;
            
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


    // Default response for other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ m2: 'Not found' }));
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});