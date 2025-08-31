const mongoose = require('mongoose');

// MP Discipline Case Schema
const mpDisciplineCaseSchema = new mongoose.Schema({
  _id: {
    type: Number,
    required: true
  },
  offender: {
    type: String,
    required: true,
    trim: true
  },
  offenderId: {
    type: String,
    required: true,
    trim: true
  },
  casefile: {
    type: String,
    required: true,
    trim: true
  },
  details: {
    type: String,
    default: null,
    trim: true
  },
  division: {
    type: String,
    required: true,
    trim: true,
    default: "MP"
  },
  status: {
    type: String,
    required: true,
    trim: true,
    enum: ["Active", "Archived", "Pending", "Resolved"],
    default: "Active"
  },
  auditorUsername: {
    type: String,
    required: true,
    trim: true,
    default: "Unknown"
  },
  auditorId: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  migratedAt: {
    type: Date,
    default: Date.now
  },
  migratedBy: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
mpDisciplineCaseSchema.index({ offender: 1 });
mpDisciplineCaseSchema.index({ offenderId: 1 });
mpDisciplineCaseSchema.index({ status: 1 });
mpDisciplineCaseSchema.index({ division: 1 });
mpDisciplineCaseSchema.index({ createdAt: -1 });

// Pre-save middleware to update timestamps
mpDisciplineCaseSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Function to get the model with the correct connection
function getMPDisciplineCaseModel(connection) {
  if (!connection) {
    throw new Error('MP Discipline database connection not available');
  }
  // Use the existing 'cases' collection in the mp_discipline database
  return connection.model('MPDisciplineCase', mpDisciplineCaseSchema, 'cases');
}

module.exports = { getMPDisciplineCaseModel, mpDisciplineCaseSchema };
