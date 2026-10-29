import mongoose from 'mongoose';

/**
 * TODO: Define Image schema
 *
 * Fields:
 * - originalName: String, required, trim, maxlength 255
 * - filename: String, required, unique
 * - mimetype: String, required, enum: ['image/jpeg', 'image/png', 'image/gif']
 * - size: Number, required, min 1, max 5MB (5 * 1024 * 1024)
 * - width: Number, required, min 1
 * - height: Number, required, min 1
 * - thumbnailFilename: String, required
 * - description: String, optional, trim, maxlength 500, default ''
 * - tags: [String], optional, default [], max 10 tags
 *   Use validate: { validator: (arr) => arr.length <= 10, message: 'Cannot have more than 10 tags' }
 * - uploadDate: Date, default Date.now
 *
 * Options:
 * - Enable timestamps (createdAt, updatedAt)
 *
 * Indexes:
 * - uploadDate: -1
 * - mimetype: 1, uploadDate: -1
 * - Text index on originalName and description for search
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const imageSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: [true, 'Original name is required'],
      trim: true,
      maxlength: [255, 'Original name must be at most 255 characters'],
    },
    filename: {
      type: String,
      required: [true, 'Filename is required'],
      unique: true,
    },
    mimetype: {
      type: String,
      required: [true, 'Mimetype is required'],
      enum: {
        values: ['image/jpeg', 'image/png', 'image/gif'],
        message: 'Mimetype must be image/jpeg, image/png or image/gif',
      },
    },
    size: {
      type: Number,
      required: [true, 'Size is required'],
      min: [1, 'Size must be at least 1 byte'],
      max: [MAX_FILE_SIZE, 'Size must be at most 5MB'],
    },
    width: {
      type: Number,
      required: [true, 'Width is required'],
      min: [1, 'Width must be at least 1'],
    },
    height: {
      type: Number,
      required: [true, 'Height is required'],
      min: [1, 'Height must be at least 1'],
    },
    thumbnailFilename: {
      type: String,
      required: [true, 'Thumbnail filename is required'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
      default: '',
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: 'Cannot have more than 10 tags',
      },
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// TODO: Add indexes
imageSchema.index({ uploadDate: -1 });
imageSchema.index({ mimetype: 1, uploadDate: -1 });
imageSchema.index({ originalName: 'text', description: 'text' });

// TODO: Create and export the Image model
export const Image = mongoose.model('Image', imageSchema);
