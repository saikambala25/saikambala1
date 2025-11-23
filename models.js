const mongoose = require('mongoose');

// 1. File Metadata Schema
const fileSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    title: String,
    description: String,
    tags: [String],
    filename: String,
    originalname: String,
    path: String,
    mimetype: String,
    size: Number,
    date: { type: Date, default: Date.now }
});

// 2. Note Schema
const noteSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    content: String,
    date: { type: Date, default: Date.now }
});

// 3. Project Schema
const projectSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    description: String,
    date: { type: Date, default: Date.now }
});

// 4. Contact Schema
const contactSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    email: String,
    phone: String,
    notes: String,
    date: { type: Date, default: Date.now }
});

// 5. Code Snippet Schema (Reusable)
const codeSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    content: String,
    date: { type: Date, default: Date.now }
});

// Export models
module.exports = {
    File: mongoose.model('File', fileSchema),
    Note: mongoose.model('Note', noteSchema),
    Project: mongoose.model('Project', projectSchema),
    Contact: mongoose.model('Contact', contactSchema),
    // Separate collections for code types to match your API structure
    PythonCode: mongoose.model('PythonCode', codeSchema),
    JavascriptCode: mongoose.model('JavascriptCode', codeSchema),
    HtmlCode: mongoose.model('HtmlCode', codeSchema),
    CssCode: mongoose.model('CssCode', codeSchema),
    OtherCode: mongoose.model('OtherCode', codeSchema),
};