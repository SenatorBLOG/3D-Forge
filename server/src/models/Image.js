import mongoose from 'mongoose'

// A reference image for the Image → Model step: either uploaded by the user or
// produced by the (stubbed) text→image generator. The bytes live on disk under
// .devdata/images and are served at /images/<id>.<ext>; this record is the
// metadata the Model step (B4) resolves by id.
const imageSchema = new mongoose.Schema(
  {
    imageId: { type: String, required: true, unique: true, index: true },
    url: { type: String, required: true },
    source: { type: String, enum: ['upload', 'generated'], required: true },
    prompt: { type: String, default: '' }, // set for generated images
    mime: { type: String, default: '' },
    ownerId: { type: String, default: null, index: true },
  },
  { timestamps: true },
)

export default mongoose.model('Image', imageSchema)
