import mongoose from 'mongoose'

// A user's 3D-token wallet: a running balance plus a capped ledger of
// transactions (signed amounts). Tokens are simulated — no real money.
const txnSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true }, // signed: +grant / -spend
    reason: { type: String, default: '' },
    balanceAfter: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

const walletSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    balance: { type: Number, default: 0 },
    history: { type: [txnSchema], default: [] },
  },
  { timestamps: true },
)

export default mongoose.model('Wallet', walletSchema)
