import http from 'http';
import url from 'url';
import { MongoClient, ObjectId } from 'mongodb';

const PORT = process.env.PORT || 3002;
const uri = 'mongodb://127.0.0.1:27017';
let client= null;


async function getClient() {
    const client = new MongoClient(uri);
    await client.connect();
    return client;
}
// Create a server
const server = http.createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', 86400); // 24 hours

    // Parse URL
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname; // Define path
    const query = parsedUrl.query; // Define query

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Handle POST requests to /api/login
    if (req.method === 'POST' && path === '/api/login') {
        let body = '';

        // Accumulate request body
        req.on('data', chunk => {
            body += chunk.toString();
        });

        // When request body is fully received
        req.on('end', async () => {
            try {
                const { emailID, wardNumber, resipassword } = JSON.parse(body);
                console.log(`Login attempt for emailID: ${emailID}, wardNumber: ${wardNumber}`);

                // Connect to MongoDB
                const client = new MongoClient(uri);
                await client.connect();

                // Access the resident database and details collection
                const database = client.db('resident');
                const collection = database.collection('details');

                // Find user by email and ward number
                const user = await collection.findOne({ emailID, wardNumber });

                if (!user) {
                    console.log('User not found');
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Invalid email or ward number' }));
                    await client.close();
                    return;
                }

                console.log('User found, comparing passwords...');
                if (resipassword === user.resipassword) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Login successful', wardNumber: user.wardNumber.toString() }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Invalid password' }));
                }

                await client.close();
            } catch (error) {
                console.error('Error processing request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Internal server error' }));
            }
        });
        return;
    }

    // Handle POST requests to /api/register
    if (req.method === 'POST' && path === '/api/register') {
        let body = '';

        // Accumulate request body
        req.on('data', chunk => {
            body += chunk.toString();
        });

        // When request body is fully received
        req.on('end', async () => {
            try {
                const { username, regemailID, regwardNumber, regresipassword } = JSON.parse(body);
                console.log(`Registration attempt for username: ${username}, emailID: ${regemailID}, wardNumber: ${regwardNumber}`);

                // Connect to MongoDB
                const client = new MongoClient(uri);
                await client.connect();

                // Access the resident database and details collection
                const database = client.db('resident');
                const collection = database.collection('details');

                // Check if the user already exists
                const existingUser = await collection.findOne({ emailID: regemailID });
                if (existingUser) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'User already exists' }));
                    await client.close();
                    return;
                }

                // Insert new user into the database
                const result = await collection.insertOne({ username: username, emailID: regemailID, wardNumber: regwardNumber, resipassword: regresipassword });
                console.log('User registered successfully');

                // Respond with success message
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Registration successful' }));

                await client.close();
            } catch (error) {
                console.error('Error processing registration:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Internal server error' }));
            }
        });
        return;
    }


    if (req.method === 'GET' && parsedUrl.pathname === '/api/ward-updates') {
        const query = parsedUrl.query;
        const wardNumber = query.wardNumber; // Remove parseInt
    
        console.log(`Received request for ward updates. Ward Number: ${wardNumber}`);
    
        if (!wardNumber) {
            console.log('Ward number is missing');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Ward number is required' }));
            return;
        }
    
        try {
            const client = new MongoClient(uri);
            await client.connect();
            const database = client.db('ward');
            const collection = database.collection('dailyUpdates');
            const wardUpdates = await collection.find({ wardNumber: wardNumber }).sort({ date: -1 }).toArray();
    
            console.log(`Found ${wardUpdates.length} updates for ward ${wardNumber}`);
    
            if (wardUpdates.length === 0) {
                console.log('No updates found for this ward');
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'No updates found for this ward' }));
            } else {
                console.log('Sending ward updates');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(wardUpdates));
            }
            await client.close();
        } catch (error) {
            console.error('Error fetching ward updates:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Internal server error' }));
        }
        return;
    }


    // Handle GET requests to /api/ward-complaints/
    if (req.method === 'GET' && path.startsWith('/api/ward-complaints/')) {
        const wardNumber = path.split('/').pop();

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
            res.end(JSON.stringify({ message: 'Internal server error' }));
        }
        return;
    }


    // Handle POST requests to /api/submit-complaint
    if (req.method === 'POST' && path === '/api/submit-complaint') {
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
    
    // Handle POST requests to /api/submit-response
    if (req.method === 'POST' && path === '/api/submit-response') {
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
  

// Handle POST requests to /api/submit-feedback
if (req.method === 'POST' && parsedUrl.pathname === '/api/submit-feedback') {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const { wardNumber, feedbackText } = JSON.parse(body);
            console.log(`Feedback received from ward ${wardNumber}: ${feedbackText}`);

            const client = await getClient();
            const database = client.db('ward');
            const collection = database.collection('feedback');

            const newFeedback = {
                wardNumber: wardNumber.toString(),
                feedbackText: feedbackText,
                date: new Date()
            };

            await collection.insertOne(newFeedback);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Feedback submitted successfully' }));

        } catch (error) {
            console.error('Error submitting feedback:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Internal server error' }));
        } 
    });
    return;
}

 // Handle static files (including map images)
 if (req.method === 'GET' && pathname.startsWith('/images/')) {
    const imagePath = path.join(__dirname, '..', pathname);
    fs.readFile(imagePath, (err, data) => {
        if (err) {
            console.error(`Error reading file: ${imagePath}`, err);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        } else {
            const ext = path.extname(imagePath).toLowerCase();
            const contentType = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif'
            }[ext] || 'application/octet-stream';

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
    return;
}




    // Default response for any other requests
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found' }));
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
process.on('SIGINT', async () => {
    if (client) {
        await client.close();
        console.log('MongoDB connection closed');
    }
    process.exit(0);
});