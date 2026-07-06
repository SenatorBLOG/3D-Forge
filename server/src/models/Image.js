import mongoose from 'mongoose'

// A reference image for the Image → Model step: either uploaded by the user or
// produced by the (stubbed) text→image generator. The bytes live on disk under
// .devdata/images and are served at /images/<id>.<ext>; this record is the
// metadata the Model step (B4) resolves by id.
const imageSchema = new mongoose.Schema(
  {
    imageId: { type: String, required: true, unique: true, index: true },
    url: { type: String, required: true },
    source: { type: String, enum: ['upload', 'generated', 'edited'], required: true },
    prompt: { type: String, default: '' }, // the generation prompt / edit instruction
    mime: { type: String, default: '' },
    ownerId: { type: String, default: null, index: true },
    // for 'edited' images: the image this one was derived from (version chain)
    parentId: { type: String, default: null, index: true },
  },
  { timestamps: true },
)

export default mongoose.model('Image', imageSchema)
