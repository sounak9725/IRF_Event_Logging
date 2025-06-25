const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    eventType: {
        type: String,
        required: true,
        enum: ['Senate', 'Duma', 'Cabinet', 'MHQ', 'Other'],
        index: true
    },
    leader: {
        type: String,
        required: true
    },
    leaderId: {
        type: String,
        required: true
    },
    timestamp: {
        type: Number,
        required: true
        // Unix timestamp
    },
    timestampStr: {
        type: String,
        required: true
        // Discord timestamp format like <t:1234567890:F>
    },
    assignedAt: {
        type: Date,
        default: Date.now
    },
    assignedBy: {
        type: String,
        required: true
        // User ID who assigned the event
    }
}, {
    timestamps: true
});

// Compound index for guild and event type (ensures one event per type per guild)
eventSchema.index({ guildId: 1, eventType: 1 }, { unique: true });

module.exports = mongoose.model('Event', eventSchema);