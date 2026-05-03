import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMissedCall extends Document {
  restaurant_id: Types.ObjectId;
  caller_number: string;
  called_at: Date;
  twilio_call_sid: string;
  whatsapp_sent_at: Date | null;
  conversation_id: Types.ObjectId | null;
  status: 'pending' | 'sent' | 'converted' | 'ignored';
}

const MissedCallSchema = new Schema<IMissedCall>(
  {
    restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    caller_number: { type: String, required: true },
    called_at: { type: Date, required: true },
    twilio_call_sid: { type: String, required: true, unique: true },
    whatsapp_sent_at: { type: Date, default: null },
    conversation_id: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
    status: {
      type: String,
      enum: ['pending', 'sent', 'converted', 'ignored'],
      default: 'pending',
    },
  },
  { timestamps: false, versionKey: false },
);

export const MissedCall = mongoose.model<IMissedCall>('MissedCall', MissedCallSchema);
