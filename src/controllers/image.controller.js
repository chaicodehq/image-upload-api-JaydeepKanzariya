import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Image } from '../models/image.model.js';
import { generateThumbnail, getImageDimensions } from '../utils/thumbnail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

const MAX_LIMIT = 50;
const SORTABLE_FIELDS = ['uploadDate', 'size', 'originalName', 'width', 'height', 'createdAt'];

// Filenames come from our own database, but basename() guarantees a path can never leave the uploads folder.
const uploadPath = (filename) => path.join(UPLOADS_DIR, path.basename(filename));
const thumbnailPath = (filename) => path.join(THUMBNAILS_DIR, path.basename(filename));

function toPositiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

// Treat the search text literally, so characters like "(" or "*" can't build a slow regex.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTags(tags) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  return list.map((tag) => String(tag).trim()).filter((tag) => tag !== '');
}

async function removeFile(filepath) {
  try {
    await fs.promises.unlink(filepath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function imageNotFound(res) {
  return res.status(404).json({ error: { message: 'Image not found' } });
}

/**
 * TODO: Upload image
 *
 * 1. Check if file uploaded (if !req.file, return 400 "No file uploaded")
 * 2. Get file info from req.file (filename, originalname, mimetype, size)
 * 3. Get image dimensions using getImageDimensions(filepath)
 * 4. Generate thumbnail using generateThumbnail(filename)
 * 5. Extract optional fields from req.body (description, tags)
 *    - Parse tags: split by comma and trim each tag
 * 6. Save metadata to database (Image.create)
 * 7. Return 201 with image metadata
 */
export async function uploadImage(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No file uploaded' } });
  }

  const { filename, originalname, mimetype, size } = req.file;
  const filepath = uploadPath(filename);
  let thumbnailFilename;

  try {
    let width;
    let height;
    try {
      ({ width, height } = await getImageDimensions(filepath));
      thumbnailFilename = await generateThumbnail(filename);
    } catch {
      // The file had an image mimetype but sharp couldn't read it, so it isn't a real image.
      await removeFile(filepath);
      if (thumbnailFilename) await removeFile(thumbnailPath(thumbnailFilename));
      return res.status(400).json({ error: { message: 'Uploaded file is not a valid image' } });
    }

    const { description } = req.body;

    const image = await Image.create({
      originalName: originalname,
      filename,
      mimetype,
      size,
      width,
      height,
      thumbnailFilename,
      description: typeof description === 'string' ? description : undefined,
      tags: parseTags(req.body.tags),
    });

    return res.status(201).json(image);
  } catch (error) {
    // Don't leave orphan files on disk when saving the metadata fails.
    await removeFile(filepath).catch(() => {});
    if (thumbnailFilename) await removeFile(thumbnailPath(thumbnailFilename)).catch(() => {});
    next(error);
  }
}

/**
 * TODO: List images with pagination and filtering
 *
 * 1. Extract query parameters:
 *    - page (default 1)
 *    - limit (default 10, max 50)
 *    - search (search in originalName and description)
 *    - mimetype (filter by mimetype)
 *    - sortBy (field to sort by, default 'uploadDate')
 *    - sortOrder (asc or desc, default 'desc')
 *
 * 2. Build MongoDB query:
 *    - Add text search if search parameter provided
 *    - Add mimetype filter if provided
 *
 * 3. Calculate pagination:
 *    - skip = (page - 1) * limit
 *    - total = await Image.countDocuments(query)
 *    - pages = Math.ceil(total / limit)
 *
 * 4. Fetch images with sorting and pagination:
 *    - Image.find(query).sort({[sortBy]: sortOrder === 'asc' ? 1 : -1}).skip(skip).limit(limit)
 *
 * 5. Calculate totalSize (sum of all image sizes)
 *
 * 6. Return 200 with:
 *    - data: images array
 *    - meta: { total, page, limit, pages, totalSize }
 */
export async function listImages(req, res, next) {
  try {
    const { search, mimetype, sortOrder } = req.query;

    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(toPositiveInt(req.query.limit, 10), MAX_LIMIT);
    const sortBy = SORTABLE_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : 'uploadDate';
    const direction = sortOrder === 'asc' ? 1 : -1;

    const query = {};
    if (typeof search === 'string' && search.trim() !== '') {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ originalName: pattern }, { description: pattern }];
    }
    if (typeof mimetype === 'string' && mimetype !== '') {
      query.mimetype = mimetype;
    }

    const [data, total, sizeTotals] = await Promise.all([
      Image.find(query)
        .sort({ [sortBy]: direction, _id: direction })
        .skip((page - 1) * limit)
        .limit(limit),
      Image.countDocuments(query),
      Image.aggregate([{ $match: query }, { $group: { _id: null, totalSize: { $sum: '$size' } } }]),
    ]);

    return res.status(200).json({
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        totalSize: sizeTotals[0]?.totalSize ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Get image metadata by ID
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Return 200 with image metadata
 */
export async function getImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return imageNotFound(res);

    return res.status(200).json(image);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download original image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct file path
 * 4. Check if file exists using fs.existsSync()
 * 5. If file missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image.mimetype
 *    - Content-Disposition: attachment; filename="originalName"
 * 7. Send file using res.sendFile(filepath)
 */
export async function downloadImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return imageNotFound(res);

    const filepath = uploadPath(image.filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }

    // res.attachment() builds a properly escaped Content-Disposition: attachment; filename="..."
    res.attachment(image.originalName);
    res.set('Content-Type', image.mimetype);
    return res.sendFile(filepath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download thumbnail
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Construct thumbnail path
 * 4. Check if thumbnail exists
 * 5. If missing: return 404 "File not found"
 * 6. Set headers:
 *    - Content-Type: image/jpeg (thumbnails are always JPEG)
 * 7. Send file using res.sendFile(thumbnailPath)
 */
export async function downloadThumbnail(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return imageNotFound(res);

    const filepath = thumbnailPath(image.thumbnailFilename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }

    res.set('Content-Type', 'image/jpeg');
    return res.sendFile(filepath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Delete image
 *
 * 1. Find image by req.params.id
 * 2. If not found: return 404 "Image not found"
 * 3. Delete original file (use try-catch, ignore ENOENT errors)
 * 4. Delete thumbnail (use try-catch, ignore ENOENT errors)
 * 5. Delete metadata from database
 * 6. Return 204 (no content)
 */
export async function deleteImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return imageNotFound(res);

    // Missing files are fine (ENOENT is ignored): the metadata must still be removed.
    await removeFile(uploadPath(image.filename));
    await removeFile(thumbnailPath(image.thumbnailFilename));

    await image.deleteOne();

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
}
