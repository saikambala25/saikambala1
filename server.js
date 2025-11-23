const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const multerS3 = require('multer-s3');

// Import Database Models
const { 
    File, Note, Project, Contact, 
    PythonCode, JavascriptCode, HtmlCode, CssCode, OtherCode,
    Activity // <--- Ensure this is in the list
} = require('./models');

const app = express();

// --- 1. OPTIMIZED DATABASE CONNECTION ---
const DB_URI = process.env.MONGODB_URI; 
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    if (!DB_URI) throw new Error("MONGODB_URI is missing in Environment Variables");

    try {
        cachedDb = await mongoose.connect(DB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ Connected to MongoDB Atlas');
        return cachedDb;
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        throw err;
    }
}

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// --- 2. AWS S3 CONFIGURATION (Fixed for ap-south-2) ---
let upload;
let s3;

if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME) {
    s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'ap-south-2', // Default to Hyderabad if missing
        signatureVersion: 'v4' // <--- CRITICAL FIX for newer regions
    });

    upload = multer({
        storage: multerS3({
            s3: s3,
            bucket: process.env.S3_BUCKET_NAME,
            metadata: function (req, file, cb) { cb(null, { fieldName: file.fieldname }); },
            key: function (req, file, cb) { cb(null, 'uploads/' + Date.now() + '-' + file.originalname); }
        }),
        limits: { fileSize: 50 * 1024 * 1024 },
    });
} else {
    // Fallback if S3 keys are missing
    upload = multer({ dest: '/tmp/' });
}

// --- Helper ---
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const modelMap = {
    files: File, notes: Note, projects: Project, contacts: Contact,
    pythonCodes: PythonCode, javascriptCodes: JavascriptCode,
    htmlCodes: HtmlCode, cssCodes: CssCode, otherCodes: OtherCode
};

// ==============================
// API ROUTES
// ==============================

// Helper to get model by type
const getModel = (type) => {
    if (['python', 'javascript', 'html', 'css', 'other'].includes(type)) {
        return modelMap[`${type}Codes`];
    }
    return modelMap[type];
}


// ==============================
// 1. ACTIVITY LOG ROUTES (SPECIFIC)
// MUST BE BEFORE GENERIC ROUTES to prevent being caught by /api/:type
// ==============================

// Get recent activities (Limited to last 20)
app.get('/api/activity', async (req, res, next) => {
    try {
        await connectToDatabase();
        // Safety check: ensure Activity model is loaded
        if (!Activity) throw new Error("Activity Model is not defined. Check models.js exports.");
        
        const activities = await Activity.find()
            .sort({ date: -1 }) // Newest first
            .limit(20);         // Only get last 20
        res.json(activities);
    } catch (err) { next(err); }
});

// Save a new activity
app.post('/api/activity', async (req, res, next) => {
    try {
        await connectToDatabase();
        // Safety check: ensure Activity model is loaded
        if (!Activity) throw new Error("Activity Model is not defined. Check models.js exports.");

        const newActivity = {
            id: generateId(),
            action: req.body.action,
            itemType: req.body.itemType,
            itemName: req.body.itemName,
            date: new Date()
        };
        const saved = await Activity.create(newActivity);
        res.status(201).json(saved);
    } catch (err) { next(err); }
});

// Clear all activity
app.delete('/api/activity', async (req, res, next) => {
    try {
        await connectToDatabase();
        // Safety check: ensure Activity model is loaded
        if (!Activity) throw new Error("Activity Model is not defined.");

        await Activity.deleteMany({});
        res.status(204).send();
    } catch (err) { next(err); }
});

// ==============================
// 2. GENERIC ROUTES (CATCH-ALL)
// ==============================

// GET ROUTES
app.get(['/api/:type', '/api/codes/:subtype'], async (req, res, next) => {
    try {
        await connectToDatabase();
        const type = req.params.subtype || req.params.type;
        const Model = getModel(type);
        if (!Model) return res.status(404).json({ error: `Invalid type: ${type}` });

        const items = await Model.find().sort({ date: -1 });
        res.json(items);
    } catch (err) { next(err); }
});

// POST ROUTES (Generic)
app.post(['/api/:type', '/api/codes/:subtype'], async (req, res, next) => {
    // If it's a file upload, skip this generic handler and go to the specific one below
    if (req.params.type === 'files' && req.path.includes('upload')) return next(); 

    try {
        await connectToDatabase();
        const type = req.params.subtype || req.params.type;
        const Model = getModel(type);
        if (!Model) return res.status(404).json({ error: `Invalid type: ${type}` });

        const newItemData = { ...req.body, id: req.body.id || generateId() };
        const savedItem = await Model.create(newItemData);
        res.status(201).json(savedItem);
    } catch (err) { next(err); }
});

// ==============================
// 3. SPECIFIC FILE OPERATIONS
// ==============================

// UPLOAD FILE (Fixed Error Handling)
const uploadMiddleware = upload.single('file');

app.post('/api/files/upload', (req, res, next) => {
    // Wrapper to catch S3/Multer errors
    uploadMiddleware(req, res, (err) => {
        if (err) return next(err); // Pass error to global handler
        next(); // Proceed to route handler
    });
}, async (req, res, next) => {
    try {
        await connectToDatabase();
        if (!s3) throw new Error("AWS S3 not configured. Check environment variables.");
        if (!req.file) throw new Error("No file uploaded.");
        
        const fileEntry = {
            id: generateId(),
            title: req.body.title || req.file.originalname,
            description: req.body.description || '',
            path: req.file.location, 
            filename: req.file.key,  
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            date: new Date()
        };
        const savedFile = await File.create(fileEntry);
        res.status(201).json(savedFile);
    } catch (err) { next(err); }
});

// DOWNLOAD FILE
app.get('/api/files/download/:id', async (req, res, next) => {
    try {
        await connectToDatabase();
        if (!s3) throw new Error("AWS S3 not configured");
        
        const fileEntry = await File.findOne({ id: req.params.id });
        if (!fileEntry) return res.status(404).json({ error: 'File not found' });

        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileEntry.filename,
            Expires: 60 
        };
        const url = s3.getSignedUrl('getObject', params);
        res.redirect(url);
    } catch (err) { next(err); }
});

// ==============================
// 4. GENERIC UPDATE/DELETE
// ==============================

// DELETE ITEM
app.delete(['/api/:type/:id', '/api/codes/:subtype/:id'], async (req, res, next) => {
    try {
        await connectToDatabase();
        const type = req.params.subtype || req.params.type;
        const id = req.params.id;
        const Model = getModel(type);

        if (!Model) return res.status(404).json({ error: 'Invalid type' });

        const item = await Model.findOne({ id: id });
        if (!item) return res.status(404).json({ error: 'Not found' });

        if (type === 'files' && s3) {
            await s3.deleteObject({ Bucket: process.env.S3_BUCKET_NAME, Key: item.filename }).promise();
        }
        await Model.deleteOne({ id: id });
        res.status(204).send();
    } catch (err) { next(err); }
});

// UPDATE ITEM
app.put(['/api/:type/:id', '/api/codes/:subtype/:id'], async (req, res, next) => {
    try {
        await connectToDatabase();
        const type = req.params.subtype || req.params.type;
        const id = req.params.id;
        const Model = getModel(type);
        
        if (!Model) return res.status(404).json({ error: 'Invalid type' });

        const updated = await Model.findOneAndUpdate({ id }, { $set: req.body }, { new: true });
        res.json(updated);
    } catch (err) { next(err); }
});

// --- GLOBAL ERROR HANDLER ---
// Catches ALL errors (DB, S3, Code) and returns JSON instead of HTML
app.use((err, req, res, next) => {
    console.error("🔥 Server Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
});

// --- VERCEL STARTUP ---
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}

module.exports = app;