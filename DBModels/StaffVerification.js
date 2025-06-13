const mongoose = require('mongoose');

// Main staff verification schema
const staffVerificationSchema = new mongoose.Schema({
    member_id: { 
        type: String, 
        default: () => new mongoose.Types.ObjectId().toString(), 
        unique: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    discord_user_id: { 
        type: String, 
        required: true, 
        unique: true 
    },
    discord_username: { 
        type: String, 
        required: true,
        trim: true
    },
    roblox_username: { 
        type: String, 
        required: true,
        trim: true
    },
    military_police_rank: { 
        type: String, 
        required: true,
        trim: true,
        default: 'N/A'
    },
    verification_status: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
    },
    verified_by: {
        type: String,
        default: null
    },
    created_at: { 
        type: Date, 
        default: Date.now 
    },
    updated_at: { 
        type: Date, 
        default: Date.now 
    }
});

// Update the updated_at field before saving
staffVerificationSchema.pre('save', function(next) {
    this.updated_at = Date.now();
    next();
});

// Create indexes for better performance
staffVerificationSchema.index({ verification_status: 1 });

const StaffVerification = mongoose.model('StaffVerification', staffVerificationSchema);

module.exports = StaffVerification;