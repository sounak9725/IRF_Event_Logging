const mongoose = require('mongoose');

// Admin Schema for managing elections
const adminSchema = new mongoose.Schema({
  isElectionActive: {
    type: Boolean,
    default: false
  },
  electionStart: {
    type: Date,
    default: null
  },
  electionDurationHours: {
    type: Number,
    default: null
  },
  parties: [{
    partyName: {
      type: String,
      required: true,
      trim: true
    },
    partyCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    }
  }],
  candidates: [{
    candidateName: {
      type: String,
      required: true,
      trim: true
    },
    party: {
      type: String,
      required: true,
      trim: true
    }
  }],
  announcementChannel: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Vote Schema for storing votes
const voteSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  candidateName: {
    type: String,
    required: true
  },
  party: {
    type: String,
    required: true
  },
  guildId: {
    type: String,
    required: true
  },
  votedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure one vote per user per election (no re-voting)
voteSchema.index({ userId: 1, electionId: 1 }, { unique: true });

// User participation tracking schema
const participationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  participatedElections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Election'
  }],
  guildId: {
    type: String,
    required: true
  },
  lastParticipation: {
    type: Date,
    default: Date.now
  }
});

// Compound index for user participation
participationSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Update timestamps middleware
adminSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = {
  Admin: mongoose.model('Admin', adminSchema),
  Vote: mongoose.model('Vote', voteSchema),
  Participation: mongoose.model('Participation', participationSchema)
};