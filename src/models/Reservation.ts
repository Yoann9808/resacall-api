import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReservation extends Document {
  restaurant_id: Types.ObjectId;
  conversation_id: Types.ObjectId | null;
  service_id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date_time: Date;
  status: 'pending' | 'pending_review' | 'confirmed' | 'cancelled' | 'no_show';
  notes: string | null;
  source: 'ai' | 'manual';
  confirmed_by: Types.ObjectId | null;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
  confirmation_sent_at: Date | null;
  created_at: Date;
}

const ReservationSchema = new Schema<IReservation>(
  {
    restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    conversation_id: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
    service_id: { type: String, required: true },
    customer_name: { type: String, required: true },
    customer_phone: { type: String, required: true },
    party_size: { type: Number, required: true },
    date_time: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'pending_review', 'confirmed', 'cancelled', 'no_show'],
      default: 'pending',
    },
    notes: { type: String, default: null },
    source: { type: String, enum: ['ai', 'manual'], required: true },
    confirmed_by: { type: Schema.Types.ObjectId, default: null },
    confirmed_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    confirmation_sent_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

export const Reservation = mongoose.model<IReservation>('Reservation', ReservationSchema);
